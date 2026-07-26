/// <reference path="../pb_data/types.d.ts" />

// PocketBase 0.22.x uses the pre-0.23 JSVM hook API: onRecordsListRequest /
// onRecordViewRequest (for LIST/VIEW response mutation) and
// onRecordBeforeCreateRequest / onRecordBeforeUpdateRequest / onRecordBeforeDeleteRequest
// (for write validation). Conventions proven against the live 0.22.20 binary in
// persons_tree_visibility.pb.js and couples_tree_visibility.pb.js:
// - Every onRecord* callback must be a single fully self-contained closure — NO
//   top-level `const`/`function` may be referenced from within any of them (the
//   JSVM re-evaluates each registered callback in isolation and does not retain
//   sibling declarations). This file duplicates the SENSITIVE_TYPES list and the
//   visibility-check logic inline in every callback rather than sharing either —
//   an earlier draft used a shared top-level SENSITIVE_TYPES const and a shared
//   isFactVisible() function, both of which would have thrown ReferenceError at
//   runtime on every request; caught before this ever ran against real data.
// - $app.dao() for a Dao instance (no e.dao). record.get()/set(). Lookup by id:
//   dao.findRecordById('collectionNameOrId', id) (no findById/update).
// - e.httpContext.get('authRecord') is the authenticated requester (null/undefined
//   for a superuser/admin request — PocketBase's rule engine already bypasses all
//   rules for those, so no-op'ing here is not a security regression).
// - List filtering must mutate e.result.items and e.result.totalItems — reassigning
//   e.records alone does not affect the response.
// - throw new NotFoundError()/ForbiddenError() directly, uncaught by your own
//   try/catch, to actually reject a request.
//
// ACCESS MODEL:
// - PUBLIC fact_type: same tree-scoping as persons — readable if the fact's
//   person.tree is in the actor's visible set (home_tree + admin_trees + home_tree's
//   own linked_trees), writable if in the actor's writable set (home_tree +
//   admin_trees, no linked_trees). Empty/unset person.tree or a failed person
//   lookup is treated as accessible (grace period / fail-open, matching the other
//   two hooks).
// - SENSITIVE fact_type (ssn, national_id, medical, address, phone, email, website,
//   residence): far stricter — a regular user may only read/write a sensitive fact
//   on their OWN linked person (person.linked_user === actor id), never via home_tree
//   or a linked_trees marriage connection. A branch admin may read/write sensitive
//   facts for persons whose tree is in their admin_trees. family_admin: everything.
// - ai_generated / verified: a non-admin, non-tree-admin actor may never set or
//   change either field to true, regardless of whether the rest of the write is
//   otherwise permitted.

onRecordsListRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const dao = $app.dao();
  const homeTreeId = authRecord.get('home_tree');
  const visibleTreeSet = new Set();
  if (homeTreeId && homeTreeId !== '') {
    visibleTreeSet.add(homeTreeId);
    try {
      const homeTree = dao.findRecordById('trees', homeTreeId);
      if (homeTree) {
        (homeTree.get('linked_trees') || []).forEach((tid) => visibleTreeSet.add(tid));
      }
    } catch (lookupErr) {
      // Fail open on lookup error.
    }
  }
  const adminTrees = authRecord.get('admin_trees') || [];
  adminTrees.forEach((tid) => visibleTreeSet.add(tid));

  const sensitiveTypes = ['ssn', 'national_id', 'medical', 'address', 'phone', 'email', 'website', 'residence'];
  const actorId = authRecord.get('id');

  const filtered = e.records.filter((record) => {
    const factType = record.get('fact_type');
    const personId = record.get('person');
    let person = null;
    try {
      person = dao.findRecordById('persons', personId);
    } catch (lookupErr) {
      return true; // fail open
    }
    if (!person) {
      return true; // fail open
    }
    const personTreeId = person.get('tree');
    if (sensitiveTypes.indexOf(factType) !== -1) {
      const isOwnLinkedPerson = (person.get('linked_user') || '') === actorId;
      const isAdminOfTree = personTreeId && personTreeId !== '' && adminTrees.indexOf(personTreeId) !== -1;
      return isOwnLinkedPerson || isAdminOfTree;
    }
    if (!personTreeId || personTreeId === '') {
      return true;
    }
    return visibleTreeSet.has(personTreeId);
  });

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'person_facts');

onRecordViewRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const dao = $app.dao();
  const homeTreeId = authRecord.get('home_tree');
  const visibleTreeSet = new Set();
  if (homeTreeId && homeTreeId !== '') {
    visibleTreeSet.add(homeTreeId);
    try {
      const homeTree = dao.findRecordById('trees', homeTreeId);
      if (homeTree) {
        (homeTree.get('linked_trees') || []).forEach((tid) => visibleTreeSet.add(tid));
      }
    } catch (lookupErr) {
      // Fail open on lookup error.
    }
  }
  const adminTrees = authRecord.get('admin_trees') || [];
  adminTrees.forEach((tid) => visibleTreeSet.add(tid));

  const sensitiveTypes = ['ssn', 'national_id', 'medical', 'address', 'phone', 'email', 'website', 'residence'];
  const actorId = authRecord.get('id');

  const factType = e.record.get('fact_type');
  const personId = e.record.get('person');
  let person = null;
  try {
    person = dao.findRecordById('persons', personId);
  } catch (lookupErr) {
    return; // fail open
  }
  if (!person) {
    return; // fail open
  }
  const personTreeId = person.get('tree');

  let visible;
  if (sensitiveTypes.indexOf(factType) !== -1) {
    const isOwnLinkedPerson = (person.get('linked_user') || '') === actorId;
    const isAdminOfTree = personTreeId && personTreeId !== '' && adminTrees.indexOf(personTreeId) !== -1;
    visible = isOwnLinkedPerson || isAdminOfTree;
  } else {
    visible = !personTreeId || personTreeId === '' || visibleTreeSet.has(personTreeId);
  }

  if (!visible) {
    throw new NotFoundError('Not found.');
  }
}, 'person_facts');

onRecordBeforeCreateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const dao = $app.dao();
  const homeTreeId = authRecord.get('home_tree');
  const writableTreeSet = new Set();
  if (homeTreeId && homeTreeId !== '') {
    writableTreeSet.add(homeTreeId);
  }
  const adminTrees = authRecord.get('admin_trees') || [];
  adminTrees.forEach((tid) => writableTreeSet.add(tid));

  const sensitiveTypes = ['ssn', 'national_id', 'medical', 'address', 'phone', 'email', 'website', 'residence'];
  const actorId = authRecord.get('id');

  const factType = e.record.get('fact_type');
  const personId = e.record.get('person');
  let person = null;
  try {
    person = dao.findRecordById('persons', personId);
  } catch (lookupErr) {
    person = null; // fail open below
  }

  if (person) {
    const personTreeId = person.get('tree');
    if (sensitiveTypes.indexOf(factType) !== -1) {
      const isOwnLinkedPerson = (person.get('linked_user') || '') === actorId;
      const isAdminOfTree = personTreeId && personTreeId !== '' && adminTrees.indexOf(personTreeId) !== -1;
      if (!isOwnLinkedPerson && !isAdminOfTree) {
        throw new ForbiddenError('You do not have permission to create sensitive facts for this person.');
      }
    } else if (personTreeId && personTreeId !== '' && !writableTreeSet.has(personTreeId)) {
      throw new ForbiddenError('You do not have permission to create facts for persons in this tree.');
    }
  }

  if (e.record.get('ai_generated') === true || e.record.get('verified') === true) {
    throw new ForbiddenError('You do not have permission to mark facts as ai_generated or verified. Contact an administrator.');
  }
}, 'person_facts');

onRecordBeforeUpdateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const dao = $app.dao();
  const homeTreeId = authRecord.get('home_tree');
  const writableTreeSet = new Set();
  if (homeTreeId && homeTreeId !== '') {
    writableTreeSet.add(homeTreeId);
  }
  const adminTrees = authRecord.get('admin_trees') || [];
  adminTrees.forEach((tid) => writableTreeSet.add(tid));

  const sensitiveTypes = ['ssn', 'national_id', 'medical', 'address', 'phone', 'email', 'website', 'residence'];
  const actorId = authRecord.get('id');

  // Fetch the persisted record — e.record is the merged existing+patch record, and
  // person/fact_type checks (plus the ai_generated/verified change-detection below)
  // need the pre-patch values, not a possibly-tampered-with incoming value.
  const persisted = dao.findRecordById('person_facts', e.record.id);
  if (!persisted) {
    throw new NotFoundError('Not found.');
  }

  const factType = persisted.get('fact_type');
  const personId = persisted.get('person');
  let person = null;
  try {
    person = dao.findRecordById('persons', personId);
  } catch (lookupErr) {
    person = null; // fail open below
  }

  if (person) {
    const personTreeId = person.get('tree');
    if (sensitiveTypes.indexOf(factType) !== -1) {
      const isOwnLinkedPerson = (person.get('linked_user') || '') === actorId;
      const isAdminOfTree = personTreeId && personTreeId !== '' && adminTrees.indexOf(personTreeId) !== -1;
      if (!isOwnLinkedPerson && !isAdminOfTree) {
        throw new ForbiddenError('You do not have permission to update sensitive facts for this person.');
      }
    } else if (personTreeId && personTreeId !== '' && !writableTreeSet.has(personTreeId)) {
      throw new ForbiddenError('You do not have permission to update facts for persons in this tree.');
    }
  }

  const persistedAiGenerated = persisted.get('ai_generated') === true;
  const persistedVerified = persisted.get('verified') === true;
  const incomingAiGenerated = e.record.get('ai_generated') === true;
  const incomingVerified = e.record.get('verified') === true;

  if ((incomingAiGenerated !== persistedAiGenerated && incomingAiGenerated) ||
      (incomingVerified !== persistedVerified && incomingVerified)) {
    throw new ForbiddenError('You do not have permission to modify ai_generated or verified fields. Contact an administrator.');
  }
}, 'person_facts');

onRecordBeforeDeleteRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const dao = $app.dao();
  const homeTreeId = authRecord.get('home_tree');
  const writableTreeSet = new Set();
  if (homeTreeId && homeTreeId !== '') {
    writableTreeSet.add(homeTreeId);
  }
  const adminTrees = authRecord.get('admin_trees') || [];
  adminTrees.forEach((tid) => writableTreeSet.add(tid));

  const sensitiveTypes = ['ssn', 'national_id', 'medical', 'address', 'phone', 'email', 'website', 'residence'];
  const actorId = authRecord.get('id');

  const factType = e.record.get('fact_type');
  const personId = e.record.get('person');
  let person = null;
  try {
    person = dao.findRecordById('persons', personId);
  } catch (lookupErr) {
    person = null; // fail open below
  }

  if (person) {
    const personTreeId = person.get('tree');
    if (sensitiveTypes.indexOf(factType) !== -1) {
      const isOwnLinkedPerson = (person.get('linked_user') || '') === actorId;
      const isAdminOfTree = personTreeId && personTreeId !== '' && adminTrees.indexOf(personTreeId) !== -1;
      if (!isOwnLinkedPerson && !isAdminOfTree) {
        throw new ForbiddenError('You do not have permission to delete sensitive facts for this person.');
      }
    } else if (personTreeId && personTreeId !== '' && !writableTreeSet.has(personTreeId)) {
      throw new ForbiddenError('You do not have permission to delete facts for persons in this tree.');
    }
  }
}, 'person_facts');
