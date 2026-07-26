/// <reference path="../pb_data/types.d.ts" />

// PocketBase 0.22.x hook conventions proven against the live 0.22.20 binary in
// persons_tree_visibility.pb.js / couples_tree_visibility.pb.js /
// person_facts_tree_visibility.pb.js: every callback self-contained (no shared
// top-level const/function), $app.dao(), record.get()/set(),
// dao.findRecordById('collectionNameOrId', id), e.httpContext.get('authRecord'),
// e.result.items/totalItems for list filtering, throw new NotFoundError()/
// ForbiddenError() directly and uncaught to actually reject a request.
//
// person_claims has no tree field of its own — scope is derived from the claim's
// 'person' relation's own tree. Extends approval from family_admin-only (today's
// PocketBase rule, left as the base rule — this hook only ADDS branch-admin scope
// on top of it, it does not narrow anything) to also allow a branch admin whose
// admin_trees includes the claimed person's tree.
//
// createRule stays untouched (any logged-in user may submit a claim — no schema
// change here). listRule/viewRule stay at their existing "own claim OR family_admin"
// base; this hook widens LIST/VIEW to also show a branch admin their own trees'
// pending claims, and widens UPDATE (approve/deny) to let a branch admin action
// claims for persons in their own admin_trees.

onRecordsListRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const dao = $app.dao();
  const adminTrees = authRecord.get('admin_trees') || [];
  const actorId = authRecord.get('id');

  // Base rule already restricts to "own claim OR family_admin" — this filter only
  // ADDS visibility for branch admins' own-tree claims on top of whatever the base
  // rule already let through, so it only needs to keep records that are either the
  // actor's own claim (already guaranteed by the base rule, kept for safety) or a
  // claim for a person in one of the actor's admin_trees.
  const filtered = e.records.filter((record) => {
    if (record.get('user') === actorId) {
      return true;
    }
    if (adminTrees.length === 0) {
      return false;
    }
    const personId = record.get('person');
    let person = null;
    try {
      person = dao.findRecordById('persons', personId);
    } catch (lookupErr) {
      return true; // fail open on lookup error
    }
    if (!person) {
      return true; // fail open
    }
    const personTreeId = person.get('tree');
    if (!personTreeId || personTreeId === '') {
      return true; // grace period for untreed persons
    }
    return adminTrees.indexOf(personTreeId) !== -1;
  });

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'person_claims');

onRecordViewRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const actorId = authRecord.get('id');
  if (e.record.get('user') === actorId) {
    return;
  }

  const adminTrees = authRecord.get('admin_trees') || [];
  if (adminTrees.length === 0) {
    throw new NotFoundError('Not found.');
  }

  const dao = $app.dao();
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
  if (!personTreeId || personTreeId === '') {
    return; // grace period
  }
  if (adminTrees.indexOf(personTreeId) === -1) {
    throw new NotFoundError('Not found.');
  }
}, 'person_claims');

// Approve/deny (update). The base persons_claims.updateRule is family_admin-only
// today — this hook adds the branch-admin-for-that-tree case on top of it. Since
// PocketBase's rule is checked BEFORE this hook fires, a non-family_admin branch
// admin's request would currently be rejected by the base rule before ever
// reaching here — closing that gap requires the base rule itself to be relaxed to
// admit branch admins generally, with THIS hook doing the precise per-tree check.
// That base-rule change ships alongside this hook (see the accompanying migration).
onRecordBeforeUpdateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  if (authRecord.get('family_admin') === true) {
    return;
  }

  const adminTrees = authRecord.get('admin_trees') || [];
  const dao = $app.dao();
  const personId = e.record.get('person');
  let person = null;
  try {
    person = dao.findRecordById('persons', personId);
  } catch (lookupErr) {
    person = null;
  }

  if (!person) {
    // Fail closed here (unlike the read-side grace period): approving/denying a
    // claim is a privileged write, not a passive read, so an unresolvable person
    // reference should not silently grant access.
    throw new ForbiddenError('You do not have permission to act on this claim.');
  }

  const personTreeId = person.get('tree');
  if (!personTreeId || personTreeId === '' || adminTrees.indexOf(personTreeId) === -1) {
    throw new ForbiddenError('You do not have permission to act on this claim.');
  }
}, 'person_claims');
