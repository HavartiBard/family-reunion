/// <reference path="../pb_data/types.d.ts" />

// Same pattern as news_tree_visibility.pb.js — see persons_tree_visibility.pb.js for the
// full list of confirmed JSVM findings this is built on. List/view-only: albums
// create/update/delete is already family_admin-only at the PocketBase rule level, and
// family_admin bypasses every hook unconditionally, so a write-path hook here would have
// zero non-bypassed callers today. Add one later only alongside whatever migration first
// grants branch-admin album-write.
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
}, 'albums');

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
}, 'albums');
