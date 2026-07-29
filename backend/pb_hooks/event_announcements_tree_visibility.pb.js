/// <reference path="../pb_data/types.d.ts" />

// `event_announcements` has no `tree` field of its own — visibility is derived via its
// required `event` relation, mirroring event_location_suggestions_tree_visibility.pb.js's
// current (post-shared-set-leak-fix) audience-check structure exactly: tree/extra_trees
// (each own-linked_trees-expanded) plus invite_only/organizer/invited-user handling.
//
// Part A — onRecordsListRequest/onRecordViewRequest: a record is visible to family_admin
// unconditionally; to an organizer of the record's event unconditionally (organizers should
// be able to review/manage their own pending announcements); to anyone else ONLY if
// record.get('sent') === true AND they'd otherwise have audience-level visibility into the
// event (reuse the standard audience check). A not-yet-sent (sent = false) announcement
// must never be visible to a non-organizer/non-admin, regardless of their tree/audience
// standing — this is the "pending announcements aren't visible early" requirement.
//
// Part B — onRecordBeforeCreateRequest: validates the requester is an organizer of
// e.record.get('event') or family_admin; throw new ForbiddenError(...) otherwise. This
// collection's createRule is intentionally broad (any approved user) — this hook is the
// precise half of the broad-rule-plus-hook pattern.
//
// Part C — onRecordBeforeDeleteRequest: same organizer/family_admin check as Part B (this
// is how a pending scheduled announcement gets cancelled — deleting it before it's sent).
//
// Part D — onRecordAfterCreateRequest: the "immediate send" path. If send_at is now-or-in-
// the-past, fan out notifications immediately and mark the record sent = true.
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
  const userId = authRecord.id;

  const visibleTreeSet = new Set();

  // An earlier draft never added the requester's own home_tree to this set, only trees
  // LINKED to it — meaning a user could never see an announcement for an event in their
  // own home tree at all, only ones in a cross-tree-linked tree. Confirmed empirically:
  // a same-tree user got 404 on a sent announcement they should see. Fixed to match the
  // established pattern used everywhere else in this codebase (e.g.
  // event_location_suggestions_tree_visibility.pb.js): add the home tree itself first,
  // then expand through its own linked_trees.
  const userHomeTreeId = authRecord.get('home_tree');
  if (userHomeTreeId && userHomeTreeId !== '') {
    visibleTreeSet.add(userHomeTreeId);
    try {
      const homeTree = userDao.findRecordById('trees', userHomeTreeId);
      if (homeTree) {
        const linkedTrees = homeTree.get('linked_trees') || [];
        linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
      }
    } catch (lookupErr) {
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

      const isOrganizer = ((event.get('organizers') || []) || []).includes(userId);

      if (isOrganizer) {
        return true;
      }

      const sentStatus = record.get('sent');
      if (!sentStatus) {
        return false;
      }

      if (!recordTreeId || recordTreeId === '') {
        if (inviteOnly) {
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
          }
          if (!hasInvite && !isFamilyAdmin) {
            return false;
          }
        }
        return true;
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
        }
      }

      let hasAccess = false;

      if (inviteOnly) {
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
        }
        if (hasInvite || isFamilyAdmin) {
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
}, 'event_announcements');

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
  const userId = authRecord.id;

  // Missing in an earlier draft — onRecordsListRequest builds this same set, but this
  // view callback referenced it without ever defining it locally, throwing a
  // ReferenceError that the surrounding try/catch below silently swallowed (catches ALL
  // errors, not just lookup failures), leaving `blocked` at its default `false` and
  // making a treed, non-invite-only, sent announcement visible to ANY approved user
  // regardless of tree — confirmed empirically on a scratch container before this fix.
  const visibleTreeSet = new Set();

  // Same home_tree-itself-must-be-included fix as onRecordsListRequest above — see its
  // comment for the full explanation.
  const userHomeTreeId = authRecord.get('home_tree');
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
  let blocked = false;
  if (eventId && eventId !== '') {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (event) {
        const recordTreeId = event.get('tree');
        const extraTrees = event.get('extra_trees') || [];
        const inviteOnly = event.get('invite_only') === true;
        const recordId = event.id;

        const isOrganizer = ((event.get('organizers') || []) || []).includes(userId);

        if (isOrganizer) {
          return;
        }

        const sentStatus = e.record.get('sent');
        if (!sentStatus) {
          blocked = true;
        } else {
          if (!recordTreeId || recordTreeId === '') {
            if (inviteOnly) {
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
              }
              if (!hasInvite && !isFamilyAdmin) {
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
              }
            }

            let hasAccess = false;

            if (inviteOnly) {
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
              }
              if (hasInvite || isFamilyAdmin) {
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

            if (!hasAccess) {
              blocked = true;
            }
          }
        }
      }
    } catch (lookupErr) {
    }
  }

  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, 'event_announcements');

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
  const userId = authRecord.id;

  const eventId = e.record.get('event');

  let allowed = false;
  if (eventId && eventId !== '') {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (event) {
        const organizers = event.get('organizers') || [];
        allowed = organizers.includes(userId);
      }
    } catch (lookupErr) {
      allowed = false;
    }
  }

  if (!allowed) {
    throw new ForbiddenError('You do not have permission to create an announcement for this event.');
  }
}, 'event_announcements');

onRecordBeforeDeleteRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userDao = $app.dao();
  const userId = authRecord.id;

  const eventId = e.record.get('event');

  let isOrganizer = false;
  if (eventId && eventId !== '') {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (event) {
        const organizers = event.get('organizers') || [];
        isOrganizer = organizers.includes(userId);
      }
    } catch (lookupErr) {
      isOrganizer = false;
    }
  }

  if (!isOrganizer) {
    throw new ForbiddenError('You do not have permission to delete this announcement.');
  }
}, 'event_announcements');

onRecordAfterCreateRequest((e) => {
  try {
    const sendAt = e.record.get('send_at');
    if (!sendAt || sendAt === '') {
      return;
    }

    // PocketBase date fields come back space-separated ("2099-01-01 00:00:00.000Z"),
    // not proper ISO-8601 with a "T" — new Date() on that raw string silently produces
    // Invalid Date (confirmed empirically), and Invalid Date > now is always false, so
    // this check would never trigger a `return` for ANY send_at value, making every
    // announcement send immediately regardless of how far in the future it's scheduled.
    // Same fix already used elsewhere in this codebase for the identical reason — see
    // helpers.js's groupNotifications, which does the same .replace(' ', 'T') on
    // PocketBase's `created` field before parsing it.
    const now = new Date();
    const sendDateTime = new Date(String(sendAt).replace(' ', 'T'));
    if (sendDateTime > now) {
      return;
    }

    const userDao = $app.dao();
    const notificationsCollection = userDao.findCollectionByNameOrId('notifications');

    const eventId = e.record.get('event');
    if (!eventId || eventId === '') {
      return;
    }

    let event;
    try {
      event = userDao.findRecordById('events', eventId);
    } catch (lookupErr) {
      return;
    }
    if (!event) {
      return;
    }

    const audienceUserIds = new Set();

    try {
      const rsvps = userDao.findRecordsByFilter(
        'event_rsvps',
        'event = {:eventId} && (status = "going" || status = "maybe")',
        '', 0, 0,
        { eventId: eventId }
      );
      rsvps.forEach((rsvp) => {
        const userId = rsvp.get('user');
        if (userId && userId !== '') {
          audienceUserIds.add(userId);
        }
      });
    } catch (lookupErr) {
    }

    try {
      const invites = userDao.findRecordsByFilter(
        'event_invites',
        'event = {:eventId} && invite_type = "user"',
        '', 0, 0,
        { eventId: eventId }
      );
      invites.forEach((invite) => {
        const userId = invite.get('user');
        if (userId && userId !== '') {
          audienceUserIds.add(userId);
        }
      });
    } catch (lookupErr) {
    }

    const announcementTitle = e.record.get('title') || '';
    const announcementBody = e.record.get('body') || '';

    audienceUserIds.forEach((recipientId) => {
      try {
        const notificationRecord = new Record(notificationsCollection);
        notificationRecord.set('user', recipientId);
        notificationRecord.set('type', 'event_announcement');
        notificationRecord.set('title', announcementTitle);
        notificationRecord.set('body', announcementBody);
        notificationRecord.set('read', false);
        notificationRecord.set('related_id', eventId);
        notificationRecord.set('related_type', 'events');

        userDao.saveRecord(notificationRecord);
      } catch (notificationErr) {
      }
    });

    e.record.set('sent', true);
    userDao.saveRecord(e.record);
  } catch (err) {
  }
}, 'event_announcements');
