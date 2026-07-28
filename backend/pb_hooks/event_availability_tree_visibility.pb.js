/// <reference path="../pb_data/types.d.ts" />

// `event_availability` has no `tree` field of its own — visibility is derived via its required
// `event` relation. List/view-only: the existing `user = self` rule already fully owns write
// authorization; once an event is hidden by events_tree_visibility.pb.js, seeing/editing an
// availability row for it becomes a UX-only "how would you get the id" concern, not a security
// one, so a write-path hook here adds no protection.
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

      const audienceTreeSet = new Set();
      audienceTreeSet.add(recordTreeId);
      extraTrees.forEach((tid) => audienceTreeSet.add(tid));

      for (const treeId of audienceTreeSet) {
        try {
          const tree = userDao.findRecordById('trees', treeId);
          if (tree) {
            const linkedTrees = tree.get('linked_trees') || [];
            linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
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
        for (const treeId of audienceTreeSet) {
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
}, 'event_availability');

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
          const audienceTreeSet = new Set();
          audienceTreeSet.add(recordTreeId);
          extraTrees.forEach((tid) => audienceTreeSet.add(tid));

          for (const treeId of audienceTreeSet) {
            try {
              const tree = userDao.findRecordById('trees', treeId);
              if (tree) {
                const linkedTrees = tree.get('linked_trees') || [];
                linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
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
            for (const treeId of audienceTreeSet) {
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
}, 'event_availability');
