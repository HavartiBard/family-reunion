/// <reference path="../pb_data/types.d.ts" />

// Same pattern as event_rsvps_tree_visibility.pb.js — see persons_tree_visibility.pb.js
// for the full list of confirmed JSVM findings this is built on. `comments` is polymorphic:
// related_id (plain text, no FK) + related_type (enum: "photo" | "album", SINGULAR).
//
// CRITICAL: related_type's values are singular ("photo"/"album") but the actual PocketBase
// collection names are plural ("photos"/"albums") — dao.findRecordById(record.get('related_type'), id)
// would silently call findRecordById('photo', ...) / findRecordById('album', ...), which
// always fails, and since lookup failure is fail-open by this codebase's convention, that
// bug would make EVERY comment permanently visible to everyone with no error and nothing
// that looks wrong under casual testing. Every callback below maps related_type to its
// real plural collection name explicitly inline (can't factor to a shared helper — the
// self-containment constraint applies per-callback).
//
// A "photo"-type comment requires a SECOND hop: comment -> photo -> photo's album -> tree.
// List/view-only: the existing `author = self || family_admin` rule already fully owns
// write authorization for update/delete. Comment *create* has no relation-visibility check
// today (createRule is plain APPROVED) — a known, pre-existing gap (same category as the
// event_rsvps rule not mentioning family_admin), not fixed here.
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

  const isCommentVisible = (relatedType, relatedId) => {
    if (!relatedId || relatedId === '') {
      return true;
    }
    try {
      let albumTreeId = null;
      if (relatedType === 'album') {
        const album = userDao.findRecordById('albums', relatedId);
        if (!album) {
          return true;
        }
        albumTreeId = album.get('tree');
      } else if (relatedType === 'photo') {
        const photo = userDao.findRecordById('photos', relatedId);
        if (!photo) {
          return true;
        }
        const albumId = photo.get('album');
        if (!albumId || albumId === '') {
          return true;
        }
        const album = userDao.findRecordById('albums', albumId);
        if (!album) {
          return true;
        }
        albumTreeId = album.get('tree');
      } else {
        // Unrecognized related_type — fail open
        return true;
      }
      if (!albumTreeId || albumTreeId === '') {
        return true;
      }
      return visibleTreeSet.has(albumTreeId);
    } catch (lookupErr) {
      return true;
    }
  };

  const filtered = e.records.filter((record) =>
    isCommentVisible(record.get('related_type'), record.get('related_id'))
  );

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'comments');

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

  const relatedType = e.record.get('related_type');
  const relatedId = e.record.get('related_id');

  let blocked = false;
  if (relatedId && relatedId !== '') {
    try {
      let albumTreeId = null;
      if (relatedType === 'album') {
        const album = userDao.findRecordById('albums', relatedId);
        albumTreeId = album ? album.get('tree') : null;
      } else if (relatedType === 'photo') {
        const photo = userDao.findRecordById('photos', relatedId);
        if (photo) {
          const albumId = photo.get('album');
          if (albumId && albumId !== '') {
            const album = userDao.findRecordById('albums', albumId);
            albumTreeId = album ? album.get('tree') : null;
          }
        }
      }
      if (albumTreeId && albumTreeId !== '' && !visibleTreeSet.has(albumTreeId)) {
        blocked = true;
      }
    } catch (lookupErr) {
      // Lookup failure — fail open, blocked stays false
    }
  }

  // Throw OUTSIDE any try/catch — see persons_tree_visibility.pb.js's header notes on
  // why a throw wrapped in a catch block silently swallows the intentional block.
  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, 'comments');
