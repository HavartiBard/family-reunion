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
// An "event_location_suggestion"-type comment requires a THIRD hop (one more than any
// prior case here): comment -> event_location_suggestions (via related_id) -> its `event`
// field -> events record -> apply the FULL audience check (tree/extra_trees/invite_only/
// organizer/invited-user — richer than the plain tree-membership check the album/photo
// cases use, since albums/photos have no invite_only-equivalent concept). Singular value
// "event_location_suggestion", matching the schema/hooks convention from #122/#123.
//
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
      // Fail open on data inconsistency
    }
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => visibleTreeSet.add(tid));

  // Full audience check against a resolved `events` record — shared logic for the
  // event_location_suggestion case below (inlined per-callback, not shared across
  // callbacks, per the self-containment constraint).
  const isEventVisible = (event) => {
    const recordTreeId = event.get('tree');
    const extraTrees = event.get('extra_trees') || [];
    const inviteOnly = event.get('invite_only') === true;
    const recordId = event.id;

    if (!recordTreeId || recordTreeId === '') {
      if (!inviteOnly) {
        return true;
      }
      const organizers = event.get('organizers') || [];
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
      return hasInvite || isFamilyAdmin || isOrganizer;
    }

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

    if (inviteOnly) {
      const organizers = event.get('organizers') || [];
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
      return hasInvite || isFamilyAdmin || isOrganizer;
    }

    for (const treeId of expandedAudienceSet) {
      if (visibleTreeSet.has(treeId)) {
        return true;
      }
    }
    return false;
  };

  const isCommentVisible = (relatedType, relatedId) => {
    if (!relatedId || relatedId === '') {
      return true;
    }
    try {
      if (relatedType === 'event_location_suggestion') {
        const suggestion = userDao.findRecordById('event_location_suggestions', relatedId);
        if (!suggestion) {
          return true;
        }
        const eventId = suggestion.get('event');
        if (!eventId || eventId === '') {
          return true;
        }
        const event = userDao.findRecordById('events', eventId);
        if (!event) {
          return true;
        }
        return isEventVisible(event);
      }

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

  // Full audience check against a resolved `events` record — see the identical helper
  // in onRecordsListRequest above for why this is richer than the plain tree-membership
  // check used for album/photo below (inlined again here, not shared, per the
  // self-containment constraint).
  const isEventVisible = (event) => {
    const recordTreeId = event.get('tree');
    const extraTrees = event.get('extra_trees') || [];
    const inviteOnly = event.get('invite_only') === true;
    const recordId = event.id;

    if (!recordTreeId || recordTreeId === '') {
      if (!inviteOnly) {
        return true;
      }
      const organizers = event.get('organizers') || [];
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
      return hasInvite || isFamilyAdmin || isOrganizer;
    }

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

    if (inviteOnly) {
      const organizers = event.get('organizers') || [];
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
      return hasInvite || isFamilyAdmin || isOrganizer;
    }

    for (const treeId of expandedAudienceSet) {
      if (visibleTreeSet.has(treeId)) {
        return true;
      }
    }
    return false;
  };

  const relatedType = e.record.get('related_type');
  const relatedId = e.record.get('related_id');

  let blocked = false;
  if (relatedId && relatedId !== '') {
    try {
      if (relatedType === 'event_location_suggestion') {
        const suggestion = userDao.findRecordById('event_location_suggestions', relatedId);
        if (suggestion) {
          const eventId = suggestion.get('event');
          if (eventId && eventId !== '') {
            const event = userDao.findRecordById('events', eventId);
            if (event && !isEventVisible(event)) {
              blocked = true;
            }
          }
        }
      } else {
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

onRecordBeforeCreateRequest((e) => {
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
      // Fail open on data inconsistency
    }
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => visibleTreeSet.add(tid));

  const relatedType = e.record.get('related_type');
  const relatedId = e.record.get('related_id');

  let blocked = false;

  if (relatedId && relatedId !== '') {
    try {
      if (relatedType === 'event_location_suggestion') {
        const suggestion = userDao.findRecordById('event_location_suggestions', relatedId);
        if (suggestion) {
          const eventId = suggestion.get('event');
          if (eventId && eventId !== '') {
            const event = userDao.findRecordById('events', eventId);
            if (event) {
              const recordTreeId = event.get('tree');
              const extraTrees = event.get('extra_trees') || [];
              const inviteOnly = event.get('invite_only') === true;

              if (!recordTreeId || recordTreeId === '') {
                if (!inviteOnly) {
                  blocked = false;
                } else {
                  const organizers = event.get('organizers') || [];
                  const isOrganizer = organizers.includes(userId);
                  let hasInvite = false;
                  try {
                    const invites = userDao.findRecordsByFilter(
                      'event_invites',
                      'event = {:eventId} && invite_type = "user" && user = {:userId}',
                      '', 1, 0,
                      { eventId: eventId, userId: userId }
                    );
                    hasInvite = invites.length > 0;
                  } catch (lookupErr) {
                    // Fail open on data inconsistency
                  }
                  if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
                    blocked = true;
                  }
                }
              } else {
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

                if (inviteOnly) {
                  const organizers = event.get('organizers') || [];
                  const isOrganizer = organizers.includes(userId);
                  let hasInvite = false;
                  try {
                    const invites = userDao.findRecordsByFilter(
                      'event_invites',
                      'event = {:eventId} && invite_type = "user" && user = {:userId}',
                      '', 1, 0,
                      { eventId: eventId, userId: userId }
                    );
                    hasInvite = invites.length > 0;
                  } catch (lookupErr) {
                    // Fail open on data inconsistency
                  }
                  if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
                    blocked = true;
                  }
                } else {
                  let isVisible = false;
                  for (const treeId of expandedAudienceSet) {
                    if (visibleTreeSet.has(treeId)) {
                      isVisible = true;
                      break;
                    }
                  }
                  if (!isVisible) {
                    blocked = true;
                  }
                }
              }
            }
          }
        }
      } else if (relatedType === 'album') {
        const album = userDao.findRecordById('albums', relatedId);
        if (album) {
          const albumTreeId = album.get('tree');
          if (albumTreeId && albumTreeId !== '' && !visibleTreeSet.has(albumTreeId)) {
            blocked = true;
          }
        }
      } else if (relatedType === 'photo') {
        const photo = userDao.findRecordById('photos', relatedId);
        if (photo) {
          const albumId = photo.get('album');
          if (albumId && albumId !== '') {
            const album = userDao.findRecordById('albums', albumId);
            if (album) {
              const albumTreeId = album.get('tree');
              if (albumTreeId && albumTreeId !== '' && !visibleTreeSet.has(albumTreeId)) {
                blocked = true;
              }
            }
          }
        }
      }
    } catch (lookupErr) {
      // Lookup failure — fail open, blocked stays false
    }
  }

  if (blocked) {
    throw new BadRequestError('Not visible.');
  }
}, 'comments');
