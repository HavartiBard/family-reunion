/// <reference path="../pb_data/types.d.ts" />

// Cron job to send scheduled event announcements.
//
// This runs independently of any HTTP request via PocketBase's cronAdd() API.
// It queries for unsent announcements whose send_at is now-or-in-the-past and
// fans out notifications to the same audience as the immediate-send path in
// event_announcements_tree_visibility.pb.js (going/maybe RSVPs + user-type invites).
//
// IMPORTANT: PocketBase date fields come back SPACE-separated (e.g. "2099-01-01 00:00:00.000Z"),
// not proper ISO-8601 with a T — new Date() on that raw string silently produces Invalid Date.
// Always do new Date(String(value).replace(' ', 'T')) before comparing/parsing any date field.

cronAdd("sendScheduledAnnouncements", "*/15 * * * *", () => {
  const now = new Date();
  const dao = $app.dao();
  const notificationsCollection = dao.findCollectionByNameOrId('notifications');

  try {
    const announcements = dao.findRecordsByFilter(
      'event_announcements',
      'sent = false && send_at <= {:now}',
      '',
      0,
      0,
      { now: now.toISOString() }
    );

    announcements.forEach((announcement) => {
      try {
        const sendAt = announcement.get('send_at');
        if (!sendAt || sendAt === '') {
          return;
        }

        const sendDateTime = new Date(String(sendAt).replace(' ', 'T'));
        if (sendDateTime > now) {
          return;
        }

        const eventId = announcement.get('event');
        if (!eventId || eventId === '') {
          return;
        }

        let event;
        try {
          event = dao.findRecordById('events', eventId);
        } catch (lookupErr) {
          return;
        }
        if (!event) {
          return;
        }

        const audienceUserIds = new Set();

        let audienceLookupFailed = false;

        try {
          const rsvps = dao.findRecordsByFilter(
            'event_rsvps',
            'event = {:eventId} && (status = "going" || status = "maybe")',
            '',
            0,
            0,
            { eventId: eventId }
          );
          rsvps.forEach((rsvp) => {
            const userId = rsvp.get('user');
            if (userId && userId !== '') {
              audienceUserIds.add(userId);
            }
          });
        } catch (lookupErr) {
          audienceLookupFailed = true;
        }

        try {
          const invites = dao.findRecordsByFilter(
            'event_invites',
            'event = {:eventId} && invite_type = "user"',
            '',
            0,
            0,
            { eventId: eventId }
          );
          invites.forEach((invite) => {
            const userId = invite.get('user');
            if (userId && userId !== '') {
              audienceUserIds.add(userId);
            }
          });
        } catch (lookupErr) {
          audienceLookupFailed = true;
        }

        if (audienceLookupFailed) {
          return;
        }

        const announcementTitle = announcement.get('title') || '';
        const announcementBody = announcement.get('body') || '';

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

            dao.saveRecord(notificationRecord);
          } catch (notificationErr) {
          }
        });

        announcement.set('sent', true);
        dao.saveRecord(announcement);
      } catch (err) {
      }
    });
  } catch (err) {
  }
});
