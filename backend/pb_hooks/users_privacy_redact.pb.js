/// <reference path="../pb_data/types.d.ts" />

// PocketBase 0.22.x uses the pre-0.23 JSVM hook API: onRecordsListRequest /
// onRecordViewRequest (for LIST/VIEW response mutation), event object exposes:
// - e.records (list) or e.record (view)
// - e.httpContext (for authenticated requestor)
//
// Findings from live smoke-testing against the dev PocketBase container (per the
// Phase 1 verification plan), all confirmed against the running 0.22.20 binary:
//
// 1. Each onRecord* callback must be fully self-contained — PocketBase's JSVM
//    re-evaluates every registered callback in isolation and does not retain sibling
//    top-level declarations from the rest of the file. A call out to ANY separate
//    top-level function (even a small pure helper like a JSON-bytes decoder) fails at
//    runtime with a silently-swallowed ReferenceError if wrapped in a catch block —
//    this bit twice during this verification pass, once in couples_tree_link.pb.js and
//    once here with an earlier draft of the decode helper below. The redaction/decode
//    logic is duplicated inline in both handlers rather than factored out.
// 2. `e.httpContext.get('authRecord')` IS the correct accessor for the authenticated
//    requester in 0.22.20 — confirmed working.
// 3. `record.get()` on a `json`-type field (e.g. `privacy_settings`) returns the raw
//    stored bytes as a JS array of char codes, NOT an auto-parsed object — confirmed by
//    seeing `[123,34,97,100,100,...]` (literally the JSON string's byte values) instead
//    of `{phone: 'admins', ...}`. Must decode via String.fromCharCode + JSON.parse
//    before reading any nested key, or every read silently misses (`.phone` is
//    `undefined` on an array, so the redaction condition never matches).

onRecordsListRequest((e) => {
  try {
    const authRecord = e.httpContext.get('authRecord');
    if (!authRecord) {
      return;
    }
    const isFamilyAdmin = authRecord.get('family_admin') === true;
    const requestorId = authRecord.get('id');

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
  } catch (err) {
    // No-op: this hook must never crash LIST requests.
  }
}, "users");

onRecordViewRequest((e) => {
  try {
    const authRecord = e.httpContext.get('authRecord');
    if (!authRecord) {
      return;
    }
    const isFamilyAdmin = authRecord.get('family_admin') === true;
    const requestorId = authRecord.get('id');

    if (e.record.get('id') === requestorId || isFamilyAdmin) {
      return;
    }
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
    // No-op: this hook must never crash VIEW requests.
  }
}, "users");
