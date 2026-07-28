/// <reference path="../pb_data/types.d.ts" />

// `event_location_votes` has no `tree`/`event` field of its own — visibility is derived
// via a TWO-HOP lookup: vote -> `suggestion` (event_location_suggestions) -> ITS `event`
// field -> events record -> apply the standard audience check. This is one hop more than
// any prior visibility hook in this codebase (the previous deepest case was photo-type
// comments at two hops: comment -> photo -> photo's album).
//
// List/view-only: the existing `user = @request.auth.id` self-ownership rule already fully
// owns write authorization (same reasoning as event_rsvps — a hidden suggestion's id being
// needed to vote on it is UX-only, not a security concern; the real integrity guarantee is
// the unique index on (suggestion, user) from the schema migration, not a hook).
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

  const filtered = e.records.filter((record) => {
    const suggestionId = record.get('suggestion');
    if (!suggestionId || suggestionId === '') {
      return true;
    }
    try {
      const suggestion = userDao.findRecordById('event_location_suggestions', suggestionId);
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

      const recordTreeId = event.get('tree');
      const extraTrees = event.get('extra_trees') || [];
      const inviteOnly = event.get('invite_only') === true;
      const recordId = event.id;

      if (!recordTreeId || recordTreeId === '') {
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
          if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
            return false;
          }
        }
        return true;
      }

      // Local, per-record set only — see events_tree_visibility.pb.js's header notes on
      // the shared-mutable-set bug this pattern exists to avoid.
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
    } catch (lookupErr) {
      return true;
    }
  });

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'event_location_votes');

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

  const suggestionId = e.record.get('suggestion');
  let blocked = false;
  if (suggestionId && suggestionId !== '') {
    try {
      const suggestion = userDao.findRecordById('event_location_suggestions', suggestionId);
      if (suggestion) {
        const eventId = suggestion.get('event');
        if (eventId && eventId !== '') {
          const event = userDao.findRecordById('events', eventId);
          if (event) {
            const recordTreeId = event.get('tree');
            const extraTrees = event.get('extra_trees') || [];
            const inviteOnly = event.get('invite_only') === true;
            const recordId = event.id;

            if (!recordTreeId || recordTreeId === '') {
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
                  // Fail open
                }
                if (!hasInvite && !isFamilyAdmin && !isOrganizer) {
                  blocked = true;
                }
              }
            } else {
              // Local, per-record set only — see onRecordsListRequest's comment above.
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
            }
          }
        }
      }
    } catch (lookupErr) {
      // Lookup failure — fail open, blocked stays false
    }
  }

  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, 'event_location_votes');
