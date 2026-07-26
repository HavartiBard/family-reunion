/// <reference path="../pb_data/types.d.ts" />

// Same pattern as photos_tree_visibility.pb.js — see persons_tree_visibility.pb.js for the
// full list of confirmed JSVM findings this is built on. `event_rsvps` has no `tree` field
// of its own — visibility is derived via its required `event` relation. List/view-only:
// the existing `user = self` rule already fully owns write authorization; once an event is
// hidden by events_tree_visibility.pb.js, RSVPing to it becomes a UX-only "how would you
// get the id" concern, not a security one, so a write-path hook here adds no protection.
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

  const isEventVisible = (eventId) => {
    if (!eventId || eventId === '') {
      return true;
    }
    try {
      const event = userDao.findRecordById('events', eventId);
      if (!event) {
        return true;
      }
      const eventTreeId = event.get('tree');
      if (!eventTreeId || eventTreeId === '') {
        return true;
      }
      return visibleTreeSet.has(eventTreeId);
    } catch (lookupErr) {
      return true;
    }
  };

  const filtered = e.records.filter((record) => isEventVisible(record.get('event')));

  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'event_rsvps');

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

  const eventId = e.record.get('event');
  let blocked = false;
  if (eventId && eventId !== '') {
    try {
      const event = userDao.findRecordById('events', eventId);
      if (event) {
        const eventTreeId = event.get('tree');
        if (eventTreeId && eventTreeId !== '' && !visibleTreeSet.has(eventTreeId)) {
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
}, 'event_rsvps');
