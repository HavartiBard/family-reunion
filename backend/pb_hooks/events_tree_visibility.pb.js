/// <reference path="../pb_data/types.d.ts" />

// Same pattern as news_tree_visibility.pb.js / persons_tree_visibility.pb.js — see those
// files for the full list of confirmed JSVM findings this is built on. `events` has its
// own single `tree` relation field. The write-path hooks here are ADDITIVE on top of the
// existing PocketBase-level rule (`organizers ~ self || family_admin` for update/delete) —
// both must independently pass; this hook only narrows further by tree.
//
// Every callback below is a single, fully self-contained closure with zero references to
// sibling top-level declarations.

onRecordsListRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userDao = $app.dao();
  const userHomeTreeId = authRecord.get('home_tree');
  const userId = authRecord.id;

  // The REQUESTER's own visible-tree set — computed once from only the requester's own
  // home_tree/admin_trees data, and NEVER mutated afterward. A prior version of this hook
  // mutated this same Set with each RECORD's own tree/extra_trees' linked_trees while
  // filtering — since Array.filter's closure shares one Set across every record, that
  // let one event's linked-tree membership "leak" forward and wrongly grant access to a
  // later, unrelated event in the same list response (and, for a single event whose own
  // tree/extra_trees happen to be mutually linked, could even self-bypass by adding its
  // own audience trees to the set it was about to check itself against). Fixed by keeping
  // this set requester-only and expanding each record's OWN audience into a separate,
  // per-record local set instead (see recordAudienceIsVisible below).
  const visibleTreeSet = new Set();

  if (userHomeTreeId && userHomeTreeId !== '') {
    visibleTreeSet.add(userHomeTreeId);
    try {
      const homeTree = userDao.findRecordById('trees', userHomeTreeId);
      if (homeTree) {
        const linkedTrees = homeTree.get('linked_trees') || [];
        linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
      }
    } catch (lookupErr) {
      // Fail open on data inconsistency
    }
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => visibleTreeSet.add(tid));

  const filtered = e.records.filter((record) => {
    const recordTreeId = record.get('tree');
    const extraTrees = record.get('extra_trees') || [];
    const inviteOnly = record.get('invite_only') === true;
    const recordId = record.id;

    if (!recordTreeId || recordTreeId === '') {
      if (inviteOnly) {
        const organizers = record.get('organizers') || [];
        const isOrganizer = organizers.includes(userId);
        let hasInvite = false;
        try {
          const invites = userDao.findRecordsByFilter(
            'event_invites',
            'event = {:eventId} && invite_type = "user" && user = {:userId}',
            '', 1, 0,
            { eventId: recordId, userId: userId }
          );
          hasInvite = invites.length > 0;
        } catch (lookupErr) {
          // Fail open on data inconsistency
        }
        if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
          return false;
        }
      }
      return true;
    }

    // This record's own audience trees, expanded through THEIR OWN linked_trees into a
    // local set that only exists for this one record's check — never written back into
    // the shared visibleTreeSet above.
    const recordAudienceSet = new Set();
    recordAudienceSet.add(recordTreeId);
    extraTrees.forEach((tid) => recordAudienceSet.add(tid));

    const expandedAudienceSet = new Set(recordAudienceSet);
    for (const treeId of recordAudienceSet) {
      try {
        const tree = userDao.findRecordById('trees', treeId);
        if (tree) {
          const linkedTrees = tree.get('linked_trees') || [];
          linkedTrees.forEach((lid) => expandedAudienceSet.add(lid));
        }
      } catch (lookupErr) {
        // Fail open on data inconsistency
      }
    }

    let hasAccess = false;

    if (inviteOnly) {
      const organizers = record.get('organizers') || [];
      const isOrganizer = organizers.includes(userId);
      let hasInvite = false;
      try {
        const invites = userDao.findRecordsByFilter(
          'event_invites',
          'event = {:eventId} && invite_type = "user" && user = {:userId}',
          '', 1, 0,
          { eventId: recordId, userId: userId }
        );
        hasInvite = invites.length > 0;
      } catch (lookupErr) {
        // Fail open on data inconsistency
      }
      if (hasInvite || isFamilyAdmin || isOrganizer) {
        hasAccess = true;
      }
    } else {
      for (const treeId of expandedAudienceSet) {
        if (visibleTreeSet.has(treeId)) {
          hasAccess = true;
          break;
        }
      }
    }

    return hasAccess;
  });

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'events');

onRecordViewRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userDao = $app.dao();
  const userHomeTreeId = authRecord.get('home_tree');
  const userId = authRecord.id;

  const visibleTreeSet = new Set();

  if (userHomeTreeId && userHomeTreeId !== '') {
    visibleTreeSet.add(userHomeTreeId);
    try {
      const homeTree = userDao.findRecordById('trees', userHomeTreeId);
      if (homeTree) {
        const linkedTrees = homeTree.get('linked_trees') || [];
        linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
      }
    } catch (lookupErr) {
      // Fail open
    }
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => visibleTreeSet.add(tid));

  const recordTreeId = e.record.get('tree');
  const extraTrees = e.record.get('extra_trees') || [];
  const inviteOnly = e.record.get('invite_only') === true;
  const recordId = e.record.id;

  if (!recordTreeId || recordTreeId === '') {
    if (inviteOnly) {
      const organizers = e.record.get('organizers') || [];
      const isOrganizer = organizers.includes(userId);
      let hasInvite = false;
      try {
        const invites = userDao.findRecordsByFilter(
          'event_invites',
          'event = {:eventId} && invite_type = "user" && user = {:userId}',
          '', 1, 0,
          { eventId: recordId, userId: userId }
        );
        hasInvite = invites.length > 0;
      } catch (lookupErr) {
        // Fail open
      }
      if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
        throw new NotFoundError('Not found.');
      }
    }
    return;
  }

  // Local, per-record set only — see onRecordsListRequest's comment above for why this
  // must never be merged back into the shared visibleTreeSet.
  const recordAudienceSet = new Set();
  recordAudienceSet.add(recordTreeId);
  extraTrees.forEach((tid) => recordAudienceSet.add(tid));

  const expandedAudienceSet = new Set(recordAudienceSet);
  for (const treeId of recordAudienceSet) {
    try {
      const tree = userDao.findRecordById('trees', treeId);
      if (tree) {
        const linkedTrees = tree.get('linked_trees') || [];
        linkedTrees.forEach((lid) => expandedAudienceSet.add(lid));
      }
    } catch (lookupErr) {
      // Fail open
    }
  }

  let blocked = false;

  if (inviteOnly) {
    const organizers = e.record.get('organizers') || [];
    const isOrganizer = organizers.includes(userId);
    let hasInvite = false;
    try {
      const invites = userDao.findRecordsByFilter(
        'event_invites',
        'event = {:eventId} && invite_type = "user" && user = {:userId}',
        '', 1, 0,
        { eventId: recordId, userId: userId }
      );
      hasInvite = invites.length > 0;
    } catch (lookupErr) {
      // Fail open
    }
    if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
      blocked = true;
    }
  } else {
    let hasAccess = false;
    for (const treeId of expandedAudienceSet) {
      if (visibleTreeSet.has(treeId)) {
        hasAccess = true;
        break;
      }
    }
    if (!hasAccess) {
      blocked = true;
    }
  }

  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, 'events');

onRecordBeforeCreateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userHomeTreeId = authRecord.get('home_tree');
  const writableTreeSet = new Set();

  if (userHomeTreeId && userHomeTreeId !== '') {
    writableTreeSet.add(userHomeTreeId);
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => writableTreeSet.add(tid));

  const newRecordTreeId = e.record.get('tree');
  if (newRecordTreeId && newRecordTreeId !== '') {
    const extraTrees = e.record.get('extra_trees') || [];
    const audienceTreeSet = new Set();
    audienceTreeSet.add(newRecordTreeId);
    extraTrees.forEach((tid) => audienceTreeSet.add(tid));

    let hasAccess = false;
    for (const treeId of audienceTreeSet) {
      if (writableTreeSet.has(treeId)) {
        hasAccess = true;
        break;
      }
    }

    if (!hasAccess) {
      throw new ForbiddenError('You do not have permission to create events for this tree.');
    }
  }
}, 'events');

onRecordBeforeUpdateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userHomeTreeId = authRecord.get('home_tree');
  const writableTreeSet = new Set();

  if (userHomeTreeId && userHomeTreeId !== '') {
    writableTreeSet.add(userHomeTreeId);
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => writableTreeSet.add(tid));

  const persistedRecord = $app.dao().findRecordById('events', e.record.id);
  const existingRecordTreeId = persistedRecord ? persistedRecord.get('tree') : '';
  if (existingRecordTreeId && existingRecordTreeId !== '') {
    const extraTrees = persistedRecord.get('extra_trees') || [];
    const audienceTreeSet = new Set();
    audienceTreeSet.add(existingRecordTreeId);
    extraTrees.forEach((tid) => audienceTreeSet.add(tid));

    let hasAccess = false;
    for (const treeId of audienceTreeSet) {
      if (writableTreeSet.has(treeId)) {
        hasAccess = true;
        break;
      }
    }

    if (!hasAccess) {
      throw new ForbiddenError('You do not have permission to update events for this tree.');
    }
  }
}, 'events');

onRecordBeforeDeleteRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  const recordTreeId = e.record.get('tree');

  if (!userAdminTrees.includes(recordTreeId)) {
    throw new ForbiddenError('You do not have permission to delete events for this tree.');
  }
}, 'events');
