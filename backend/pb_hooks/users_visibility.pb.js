/// <reference path="../pb_data/types.d.ts" />

// Formerly users_privacy_redact.pb.js — renamed and expanded to also carry tree-scoping
// for the directory/home-dashboard "who can see which users" question, per Phase 6
// (community-layer tree scoping). Merged into ONE hook file, rather than adding a
// sibling file that also registers onRecordsListRequest/onRecordViewRequest for `users`,
// because this codebase has zero precedent for two separate hook files independently
// registering handlers for the same collection+event pair, and whether PocketBase
// 0.22.20 correctly composes both (vs. one silently winning) is unverified. Merging
// sidesteps that risk by construction: each callback below still one self-contained
// closure, just carrying two concerns (redaction + tree-filtering) — same shape
// person_facts_tree_visibility.pb.js already uses for public-vs-sensitive fact gating.
//
// Tree-visibility here follows the SAME fail-open-forever policy as persons/news/events:
// a user with no home_tree stays visible to everyone (this in practice mostly matters for
// the 3 svc-* service accounts, which is why backfill_community_tree.py repoints them onto
// a dedicated, never-linked "Service Accounts" tree instead of relying on this hook alone).
//
// Original findings this file is built on (still apply):
// 1. Each onRecord* callback must be fully self-contained — PocketBase's JSVM
//    re-evaluates every registered callback in isolation and does not retain sibling
//    top-level declarations from the rest of the file.
// 2. `e.httpContext.get('authRecord')` is the correct accessor for the authenticated
//    requester.
// 3. `record.get()` on a `json`-type field (e.g. `privacy_settings`) returns the raw
//    stored bytes as a JS array of char codes, NOT an auto-parsed object — must decode
//    via String.fromCharCode + JSON.parse before reading any nested key.
// 4. A user must always see their OWN record regardless of tree overlap — self-bypass is
//    keyed on record.get('id') === requestorId, never on home_tree equality (a user with
//    no home_tree set must still always see themselves).

onRecordsListRequest((e) => {
  try {
    const authRecord = e.httpContext.get('authRecord');
    if (!authRecord) {
      return;
    }
    const isFamilyAdmin = authRecord.get('family_admin') === true;
    const requestorId = authRecord.get('id');

    // Redaction pass (unchanged from the original users_privacy_redact.pb.js behavior).
    e.records.forEach((record) => {
      if (record.get('id') === requestorId || isFamilyAdmin) {
        return;
      }
      let privacySettings = record.get('privacy_settings');
      if (Array.isArray(privacySettings)) {
        try {
          privacySettings = JSON.parse(String.fromCharCode.apply(null, privacySettings));
        } catch (parseErr) {
          privacySettings = null;
        }
      }
      if (privacySettings && typeof privacySettings === 'object' && privacySettings.phone === 'admins') {
        record.set('phone', '');
      }
    });

    if (isFamilyAdmin) {
      return;
    }

    // Tree-visibility filtering pass.
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

    const filtered = e.records.filter((record) => {
      if (record.get('id') === requestorId) {
        return true;
      }
      const recordHomeTreeId = record.get('home_tree');
      if (!recordHomeTreeId || recordHomeTreeId === '') {
        return true;
      }
      return visibleTreeSet.has(recordHomeTreeId);
    });

    e.result.items = filtered;
    e.result.totalItems = filtered.length;
  } catch (err) {
    // No-op: this hook must never crash LIST requests.
  }
}, "users");

onRecordViewRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) {
    return;
  }
  const isFamilyAdmin = authRecord.get('family_admin') === true;
  const requestorId = authRecord.get('id');
  const isSelfOrAdmin = e.record.get('id') === requestorId || isFamilyAdmin;

  // Redaction — kept in its own try/catch since it must never crash a VIEW request and
  // never needs to throw.
  if (!isSelfOrAdmin) {
    try {
      let privacySettings = e.record.get('privacy_settings');
      if (Array.isArray(privacySettings)) {
        try {
          privacySettings = JSON.parse(String.fromCharCode.apply(null, privacySettings));
        } catch (parseErr) {
          privacySettings = null;
        }
      }
      if (privacySettings && typeof privacySettings === 'object' && privacySettings.phone === 'admins') {
        e.record.set('phone', '');
      }
    } catch (err) {
      // No-op: redaction must never crash VIEW requests.
    }
  }

  if (isSelfOrAdmin) {
    return;
  }

  // Tree-visibility blocking — the "blocked" decision is computed inside a try/catch that
  // never throws (lookup failures fail open); the actual throw happens OUTSIDE any
  // try/catch. A NotFoundError thrown from inside a try/catch — even one with an
  // `instanceof` re-throw check — has been confirmed in this codebase to be silently
  // swallowed rather than propagated. See persons_tree_visibility.pb.js's header notes.
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

  const recordHomeTreeId = e.record.get('home_tree');
  const blocked = !!(recordHomeTreeId && recordHomeTreeId !== '' && !visibleTreeSet.has(recordHomeTreeId));

  if (blocked) {
    throw new NotFoundError('Not found.');
  }
}, "users");
