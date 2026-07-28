/// <reference path="../pb_data/types.d.ts" />

// `event_location_suggestions` has no `tree` field of its own — visibility is derived via
// its required `event` relation, mirroring event_availability_tree_visibility.pb.js's
// current (post-shared-set-leak-fix) audience-check structure exactly: tree/extra_trees
// (each own-linked_trees-expanded) plus invite_only/organizer/invited-user handling.
//
// Before-create additionally validates the requester can actually see the target event —
// this collection's createRule is intentionally broad (any approved user), so this hook is
// the "precise" half of the broad-rule-plus-hook pattern used throughout this codebase.
// No before-update/before-delete hook needed — the collection rule's
// `suggested_by = @request.auth.id` self-ownership already fully owns those.
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
    const eventId = record.get('event');
    if (!eventId || eventId === '') {
      return true;
    }
    try {
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

      // Local, per-record set only — never written back into the shared visibleTreeSet
      // above, which must stay derived from the REQUESTER's own trees only (see
      // events_tree_visibility.pb.js's header notes on the shared-mutable-set bug this
      // pattern exists to avoid).
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
}, 'event_location_suggestions');

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

  const eventId = e.record.get('event');
  let blocked = false;
  if (eventId && eventId !== '') {
    try {
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
    } catch (lookupErr) {
      // Lookup failure — fail open, blocked stays false
    }
  }

  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, 'event_location_suggestions');

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

  const eventId = e.record.get('event');

  // This is a permission CHECK, not a visibility filter — a missing/unreadable event
  // fails CLOSED (reject the create), unlike the fail-open convention used above for
  // list/view.
  let allowed = false;
  if (eventId && eventId !== '') {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (event) {
        const recordTreeId = event.get('tree');
        const extraTrees = event.get('extra_trees') || [];
        const inviteOnly = event.get('invite_only') === true;
        const recordId = event.id;

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
            hasInvite = false;
          }
          allowed = hasInvite || isOrganizer;
        } else if (!recordTreeId || recordTreeId === '') {
          // Tree-less, not invite-only — broadcast to every approved user (same
          // fail-open-forever policy documented in events_tree_visibility.pb.js).
          allowed = true;
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
              // Fail open on data inconsistency (tree lookup, not the top-level check)
            }
          }

          for (const treeId of expandedAudienceSet) {
            if (visibleTreeSet.has(treeId)) {
              allowed = true;
              break;
            }
          }
        }
      }
    } catch (lookupErr) {
      allowed = false;
    }
  }

  if (!allowed) {
    throw new ForbiddenError('You do not have permission to suggest a location for this event.');
  }
}, 'event_location_suggestions');
