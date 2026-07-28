/// <reference path="../pb_data/types.d.ts" />

// Custom route handler for guest RSVP functionality.
// Unauthenticated routes keyed by event_invite.token - the token itself is the credential.
// Uses PocketBase 0.22.20 JSVM API (routerAdd, DynamicModel, c.bind, etc.).

// GET /api/guest-invite/{token} - fetch public event info + guest invite status
routerAdd('GET', '/api/guest-invite/:token', (c) => {
  const dao = $app.dao();
  const token = c.pathParam('token');

  if (!token || token === '') {
    throw new NotFoundError('Invite not found.');
  }

  let invite = null;
  let inviteNotFound = false;

  try {
    invite = dao.findFirstRecordByFilter('event_invites', 'token = {:token}', { token: token });
  } catch (lookupErr) {
    // Lookup failure means not found
    inviteNotFound = true;
  }

  if (!invite || inviteNotFound) {
    throw new NotFoundError('Invite not found.');
  }

  // Guest routes are for email-type invites only. A "user"-type invite's token is not a
  // guest credential — that invitee has a real account and must go through the normal
  // authenticated RSVP flow. Without this check, anyone who obtained a user-type invite's
  // token (e.g. it leaking via a shared link) could read/modify that invite unauthenticated.
  if (invite.get('invite_type') !== 'email') {
    throw new NotFoundError('Invite not found.');
  }

  const eventId = invite.get('event');
  let event = null;
  let eventNotFound = false;

  try {
    event = dao.findRecordById('events', eventId);
  } catch (lookupErr) {
    eventNotFound = true;
  }

  if (!event || eventNotFound) {
    throw new NotFoundError('Event not found.');
  }

  return c.json(200, {
    id: event.id,
    name: event.get('name'),
    description: event.get('description'),
    start_date: event.get('start_date'),
    end_date: event.get('end_date'),
    location: event.get('location'),
    cover_photo: event.get('cover_photo'),
    status: invite.get('status'),
    guest_name: invite.get('guest_name'),
  });
});

// POST /api/guest-invite/{token}/rsvp - update guest RSVP status
routerAdd('POST', '/api/guest-invite/:token/rsvp', (c) => {
  const dao = $app.dao();
  const token = c.pathParam('token');

  if (!token || token === '') {
    throw new NotFoundError('Invite not found.');
  }

  // Parse body: {status, guest_name?}
  // IMPORTANT: DynamicModel field access uses the literal key name from the object literal
  const data = new DynamicModel({ status: '', guest_name: '' });
  c.bind(data);

  const status = data.status;
  const guestName = data.guest_name;

  // Validate status - must be one of the active RSVP states
  const validStatuses = ['going', 'maybe', 'no'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError('Invalid status. Must be one of: going, maybe, no.');
  }

  // Reject 'pending' - that's the initial state only
  if (status === 'pending') {
    throw new BadRequestError('Cannot RSVP as "pending". Please choose going, maybe, or no.');
  }

  let invite = null;
  let inviteNotFound = false;

  try {
    invite = dao.findFirstRecordByFilter('event_invites', 'token = {:token}', { token: token });
  } catch (lookupErr) {
    inviteNotFound = true;
  }

  if (!invite || inviteNotFound) {
    throw new NotFoundError('Invite not found.');
  }

  // Guest routes are for email-type invites only — see the same check in the GET handler
  // above for why.
  if (invite.get('invite_type') !== 'email') {
    throw new NotFoundError('Invite not found.');
  }

  // Update status and optionally guest_name via privileged JSVM save
  invite.set('status', status);
  if (guestName !== undefined && guestName !== '') {
    invite.set('guest_name', guestName);
  }

  dao.saveRecord(invite);

  return c.json(200, {
    status: invite.get('status'),
    guest_name: invite.get('guest_name'),
  });
});
