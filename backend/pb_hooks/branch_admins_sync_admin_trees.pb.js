/// <reference path="../pb_data/types.d.ts" />

// Keeps users.admin_trees in sync whenever branch_admins changes. Every Phase 3
// visibility/write hook (persons_tree_visibility.pb.js, couples_tree_visibility.pb.js,
// person_facts_tree_visibility.pb.js, person_claims_tree_scope.pb.js) reads
// authRecord.get('admin_trees') directly off the users record — without this hook,
// a newly-assigned branch admin's admin_trees would stay stale (only ever set by
// the one-time Phase 2 backfill script) and they'd silently have no admin access
// until someone manually patched their user record.
//
// Recomputes the FULL admin_trees set from ALL of that user's branch_admins rows on
// every create/update/delete, rather than incrementally adding/removing one tree —
// simpler and self-correcting (a stray manual edit to users.admin_trees would be
// overwritten back to the true source-of-truth on the next branch_admins change,
// which is the desired behavior: branch_admins is the source of truth, admin_trees
// is a derived cache).
//
// Conventions proven in the other pb_hooks files this session: every callback
// self-contained (no shared top-level declarations), $app.dao(), record.get()/set(),
// dao.findRecordById()/saveRecord(). onRecordAfterCreateRequest/
// onRecordAfterUpdateRequest/onRecordAfterDeleteRequest all receive e.record for the
// branch_admins row being written; e.record.get('user') is that row's user id in all
// three (PocketBase populates e.record from the existing row for delete too).

onRecordAfterCreateRequest((e) => {
  try {
    const dao = $app.dao();
    const userId = e.record.get('user');
    if (!userId) {
      return;
    }
    const rows = dao.findRecordsByFilter('branch_admins', 'user = {:userId}', '', 0, 0, { userId: userId });
    const treeIds = new Set();
    rows.forEach((row) => {
      (row.get('tree') || []).forEach((tid) => treeIds.add(tid));
    });
    const user = dao.findRecordById('users', userId);
    if (user) {
      user.set('admin_trees', Array.from(treeIds));
      dao.saveRecord(user);
    }
  } catch (err) {
    // No-op: this hook must never crash branch_admins writes.
  }
}, 'branch_admins');

onRecordAfterUpdateRequest((e) => {
  try {
    const dao = $app.dao();
    const userId = e.record.get('user');
    if (!userId) {
      return;
    }
    const rows = dao.findRecordsByFilter('branch_admins', 'user = {:userId}', '', 0, 0, { userId: userId });
    const treeIds = new Set();
    rows.forEach((row) => {
      (row.get('tree') || []).forEach((tid) => treeIds.add(tid));
    });
    const user = dao.findRecordById('users', userId);
    if (user) {
      user.set('admin_trees', Array.from(treeIds));
      dao.saveRecord(user);
    }
  } catch (err) {
    // No-op: this hook must never crash branch_admins writes.
  }
}, 'branch_admins');

onRecordAfterDeleteRequest((e) => {
  try {
    const dao = $app.dao();
    const userId = e.record.get('user');
    if (!userId) {
      return;
    }
    const rows = dao.findRecordsByFilter('branch_admins', 'user = {:userId}', '', 0, 0, { userId: userId });
    const treeIds = new Set();
    rows.forEach((row) => {
      (row.get('tree') || []).forEach((tid) => treeIds.add(tid));
    });
    const user = dao.findRecordById('users', userId);
    if (user) {
      user.set('admin_trees', Array.from(treeIds));
      dao.saveRecord(user);
    }
  } catch (err) {
    // No-op: this hook must never crash branch_admins writes.
  }
}, 'branch_admins');
