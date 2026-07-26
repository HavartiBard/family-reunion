/// <reference path="../pb_data/types.d.ts" />

// Same pattern as albums_tree_visibility.pb.js — see persons_tree_visibility.pb.js for the
// full list of confirmed JSVM findings this is built on. `photos` has no `tree` field of
// its own — visibility is derived via its required `album` relation (couples-style: look
// up the related record, fail open on any lookup failure or unset tree). List/view-only:
// the existing `uploader = self || family_admin` rule already fully owns write
// authorization; tree is inherited from the (already-scoped) album, so a write-path hook
// here adds no additional protection.
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

  const isAlbumVisible = (albumId) => {
    if (!albumId || albumId === '') {
      return true;
    }
    try {
      const album = userDao.findRecordById('albums', albumId);
      if (!album) {
        return true;
      }
      const albumTreeId = album.get('tree');
      if (!albumTreeId || albumTreeId === '') {
        return true;
      }
      return visibleTreeSet.has(albumTreeId);
    } catch (lookupErr) {
      return true;
    }
  };

  const filtered = e.records.filter((record) => isAlbumVisible(record.get('album')));

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'photos');

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

  const albumId = e.record.get('album');
  let blocked = false;
  if (albumId && albumId !== '') {
    try {
      const album = userDao.findRecordById('albums', albumId);
      if (album) {
        const albumTreeId = album.get('tree');
        if (albumTreeId && albumTreeId !== '' && !visibleTreeSet.has(albumTreeId)) {
          blocked = true;
        }
      }
    } catch (lookupErr) {
      // Lookup failure — fail open, blocked stays false
    }
  }

  // Throw OUTSIDE any try/catch — a throw wrapped in a catch block (even one that
  // re-throws via an instanceof check) has been confirmed to silently swallow the
  // intentional block in this PocketBase version. See persons_tree_visibility.pb.js's
  // header notes.
  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, 'photos');
