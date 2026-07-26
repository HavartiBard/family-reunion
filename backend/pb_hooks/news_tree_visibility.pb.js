/// <reference path="../pb_data/types.d.ts" />

// PocketBase 0.22.x uses the pre-0.23 JSVM hook API: onRecordsListRequest /
// onRecordViewRequest (for LIST/VIEW response mutation) and
// onRecordBeforeCreateRequest / onRecordBeforeUpdateRequest / onRecordBeforeDeleteRequest
// (for write validation). Same pattern as persons_tree_visibility.pb.js / couples_tree_visibility.pb.js
// — see those files for the full list of confirmed JSVM findings this pattern is built on.
// `news` has its own single `tree` relation field (unlike couples/photos/etc, which derive
// theirs via a relation lookup), so this file mirrors persons_tree_visibility.pb.js almost
// exactly, minus the linked_user claim-bypass logic (which doesn't apply to news).
//
// Every callback below is a single, fully self-contained closure with zero references to
// sibling top-level declarations — PocketBase's JSVM re-evaluates each callback in isolation.

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
}, 'news');

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
}, 'news');

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
    throw new ForbiddenError('You do not have permission to post news for this tree.');
  }
  // If tree is empty/unset, allow it through (fail-open, matches persons/couples policy).
}, 'news');

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

  // Check against the EXISTING record's persisted tree, not the incoming patch.
  const persistedRecord = $app.dao().findRecordById('news', e.record.id);
  const existingRecordTreeId = persistedRecord ? persistedRecord.get('tree') : '';
  if (existingRecordTreeId && existingRecordTreeId !== '' && !writableTreeSet.has(existingRecordTreeId)) {
    throw new ForbiddenError('You do not have permission to update news for this tree.');
  }
}, 'news');

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
    throw new ForbiddenError('You do not have permission to delete news for this tree.');
  }
}, 'news');
