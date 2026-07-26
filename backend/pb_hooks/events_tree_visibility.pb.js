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
    if (!recordTreeId || recordTreeId === '') {
      return true;
    }
    return visibleTreeSet.has(recordTreeId);
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

  const userHomeTreeId = authRecord.get('home_tree');
  const visibleTreeSet = new Set();

  if (userHomeTreeId && userHomeTreeId !== '') {
    visibleTreeSet.add(userHomeTreeId);
    try {
      const userDao = $app.dao();
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
  if (recordTreeId && recordTreeId !== '' && !visibleTreeSet.has(recordTreeId)) {
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
  if (newRecordTreeId && newRecordTreeId !== '' && !writableTreeSet.has(newRecordTreeId)) {
    throw new ForbiddenError('You do not have permission to create events for this tree.');
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
  if (existingRecordTreeId && existingRecordTreeId !== '' && !writableTreeSet.has(existingRecordTreeId)) {
    throw new ForbiddenError('You do not have permission to update events for this tree.');
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
