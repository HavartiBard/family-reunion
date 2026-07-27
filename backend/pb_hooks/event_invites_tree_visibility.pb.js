/// <reference path="../pb_data/types.d.ts" />

// Same pattern as event_rsvps_tree_visibility.pb.js / comments_tree_visibility.pb.js — see
// those files for the full list of confirmed JSVM findings this is built on. `event_invites`
// has no `tree` field of its own — visibility is derived via its required `event` relation.
//
// Write-path hooks are not needed: the existing collection rule (`@request.auth.id != "" &&
// @request.auth.approved = true`) is intentionally broad, and precise scoping for
// update/delete is already handled by the organizer/family_admin rule from the events hook.
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

  const isInviteVisible = (inviteRecord) => {
    const invitedById = inviteRecord.get('invited_by');
    if (invitedById === userId) {
      return true;
    }

    const inviteeUser = inviteRecord.get('user');
    if (inviteeUser && inviteeUser === userId) {
      return true;
    }

    const eventId = inviteRecord.get('event');
    if (!eventId || eventId === '') {
      return false;
    }
    try {
      const event = userDao.findRecordById('events', eventId);
      if (!event) {
        return false;
      }
      const organizers = event.get('organizers') || [];
      return organizers.includes(userId);
    } catch (lookupErr) {
      return false;
    }
  };

  const filtered = e.records.filter((record) => isInviteVisible(record));

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'event_invites');

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

  const invitedById = e.record.get('invited_by');
  let visible = false;
  if (invitedById === userId) {
    visible = true;
  }

  const inviteeUser = e.record.get('user');
  if (!visible && inviteeUser && inviteeUser === userId) {
    visible = true;
  }

  const eventId = e.record.get('event');
  if (!visible && eventId && eventId !== '') {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (event) {
        const organizers = event.get('organizers') || [];
        if (organizers.includes(userId)) {
          visible = true;
        }
      }
    } catch (lookupErr) {
      // Lookup failure — fail open, visible stays false
    }
  }

  if (!visible) {
    throw new NotFoundError('Not found.');
  }
}, 'event_invites');

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
  let invalid = false;
  if (!eventId || eventId === '') {
    invalid = true;
  } else {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (!event) {
        invalid = true;
      } else {
        const organizers = event.get('organizers') || [];
        if (!organizers.includes(userId)) {
          invalid = true;
        }
      }
    } catch (lookupErr) {
      // This is a permission CHECK, not a visibility filter — unlike the fail-open
      // convention used elsewhere in this codebase for list/view hooks, a lookup
      // failure here means the referenced event doesn't exist, which must fail
      // CLOSED (reject the create), not open. Fail-open here would let anyone
      // create an event_invites row against a bogus event id with no organizer
      // check at all, since a nonexistent event has no organizers to check against.
      invalid = true;
    }
  }

  if (invalid) {
    throw new ForbiddenError('You do not have permission to create invites for this event.');
  }

  const inviteType = e.record.get('invite_type');
  const userField = e.record.get('user');
  const emailField = e.record.get('email');

  let hasOneTarget = false;
  if (inviteType === 'user') {
    hasOneTarget = !!userField && !emailField;
  } else if (inviteType === 'email') {
    hasOneTarget = !!emailField && !userField;
  }
  if (!hasOneTarget) {
    throw new ForbiddenError('Invite must have exactly one target: user for "user" type, or email for "email" type.');
  }

  const tokenField = e.record.get('token');
  if (!tokenField || tokenField === '') {
    const token = Array.from({length: 40}, () => Math.floor(Math.random() * 36).toString(36)).join('');
    e.record.set('token', token);
  }
}, 'event_invites');

onRecordAfterCreateRequest((e) => {
  try {
    const inviteType = e.record.get('invite_type');
    if (inviteType !== 'user') {
      return;
    }

    const userDao = $app.dao();
    const inviteUserId = e.record.get('user');
    if (!inviteUserId) {
      return;
    }

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

    const eventTitle = event.get('name');
    if (!eventTitle || eventTitle === '') {
      return;
    }

    const notificationsCollection = userDao.findCollectionByNameOrId('notifications');
    const notificationRecord = new Record(notificationsCollection);
    notificationRecord.set('user', inviteUserId);
    notificationRecord.set('type', 'rsvp');
    notificationRecord.set('title', 'You have been invited to an event');
    notificationRecord.set('body', `You have been invited to "${eventTitle}".`);
    notificationRecord.set('read', false);
    notificationRecord.set('related_id', eventId);
    notificationRecord.set('related_type', 'events');

    userDao.saveRecord(notificationRecord);
  } catch (err) {
    // No-op: this hook must never crash event_invites writes.
  }
}, 'event_invites');
