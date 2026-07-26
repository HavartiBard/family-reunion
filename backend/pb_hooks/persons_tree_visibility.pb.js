/// <reference path="../pb_data/types.d.ts" />

// PocketBase 0.22.x uses the pre-0.23 JSVM hook API: onRecordsListRequest /
// onRecordViewRequest (for LIST/VIEW response mutation) and
// onRecordBeforeCreateRequest / onRecordBeforeUpdateRequest / onRecordBeforeDeleteRequest
// (for write validation). Event object structure per findings in couples_tree_link.pb.js
// and users_privacy_redact.pb.js:
// - onRecordsListRequest: e.records, e.result, e.httpContext
// - onRecordViewRequest: e.record, e.httpContext
// - onRecordBefore*Request: e.record, e.httpContext
//
// CRITICAL findings confirmed against live 0.22.20 binary this session:
// 1. Every onRecord* callback must be a single fully self-contained closure with ZERO
//    references to any other top-level function or const — PocketBase's JSVM re-evaluates
//    each callback in isolation and does NOT retain sibling declarations.
// 2. Use global $app.dao() to get a Dao instance — there is no e.dao.
// 3. Record field access: record.get('fieldName') and record.set('fieldName', value).
// 4. Persistence: dao.saveRecord(record); lookup by id: dao.findRecordById('collectionNameOrId', id).
// 5. Relation fields: single-select returns plain string id (or empty string if unset);
//    multi-select returns JS array of string ids (or empty array).
// 6. Authenticated requester in onRecordsListRequest/onRecordViewRequest:
//    e.httpContext.get('authRecord') returns Record object or null/undefined if unauthenticated.
//    A PocketBase superuser/admin request will NOT have this evaluate to a users record —
//    treat null/undefined as admin request, do not filter (admin bypass is safe because
//    PocketBase's own rule engine already fully bypasses all rules for superuser requests).
// 7. In onRecordBefore*Request, authenticated requester: e.httpContext.get('authRecord'),
//    record being created/updated/deleted: e.record.
// 8. List-filtering: reassigning e.records does NOT change the HTTP response — must set
//    BOTH e.result.items = filteredArray AND e.result.totalItems = filteredArray.length.
// 9. View-blocking: to return 404, throw new NotFoundError('message') directly — do NOT
//    wrap in try/catch that could swallow it.
// 10. Write rejection: throw new BadRequestError('message') or ForbiddenError('message')
//     directly — verify actual HTTP status codes (400/403 vs 500).

onRecordsListRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  
  // Admin/superuser request: do not filter
  if (!authRecord) {
    return;
  }
  
  const isFamilyAdmin = authRecord.get('family_admin') === true;
  
  // Family admin: do not filter
  if (isFamilyAdmin) {
    return;
  }
  
  // Compute visible tree set for regular users:
  // - user's home_tree (if non-empty)
  // - user's admin_trees array
  // - home_tree's own linked_trees array (for transitively-linked trees via marriage)
  const userId = authRecord.get('id');
  const userDao = $app.dao();
  const userHomeTreeId = authRecord.get('home_tree');
  
  const visibleTreeSet = new Set();
  
  if (userHomeTreeId && userHomeTreeId !== '') {
    visibleTreeSet.add(userHomeTreeId);
    // Get home_tree's linked_trees (only for home_tree, not admin_trees)
    try {
      const homeTree = userDao.findRecordById('trees', userHomeTreeId);
      if (homeTree) {
        const linkedTrees = homeTree.get('linked_trees') || [];
        linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
      }
    } catch (lookupErr) {
      // If the lookup fails, just proceed without linked trees — fail open to avoid
      // making the app unusable due to a data inconsistency in this hook.
    }
  }
  
  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => visibleTreeSet.add(tid));
  
  // Filter records: keep if tree field is in visibleTreeSet OR empty/unset
  // (intentional safety: persons without a tree assigned should remain visible)
  const filtered = e.records.filter((record) => {
    const recordTreeId = record.get('tree');
    if (!recordTreeId || recordTreeId === '') {
      return true;
    }
    return visibleTreeSet.has(recordTreeId);
  });
  
  // CRITICAL: must set both items and totalItems to affect the HTTP response
  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'persons');

onRecordViewRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  
  // Admin/superuser request: do not block
  if (!authRecord) {
    return;
  }
  
  const isFamilyAdmin = authRecord.get('family_admin') === true;
  
  // Family admin: do not block
  if (isFamilyAdmin) {
    return;
  }
  
  // Compute visible tree set for regular users (same logic as onRecordsListRequest)
  const userHomeTreeId = authRecord.get('home_tree');
  
  const visibleTreeSet = new Set();
  
  if (userHomeTreeId && userHomeTreeId !== '') {
    visibleTreeSet.add(userHomeTreeId);
    try {
      const userDao = $app.dao();
      const homeTree = userDao.findRecordById('trees', userHomeTreeId);
      if (homeTree) {
        const linkedTrees = homeTree.get('linked_trees') || [];
        linkedTrees.forEach((lid) => visibleTreeSet.add(lid));
      }
    } catch (lookupErr) {
      // Fail open if lookup fails
    }
  }
  
  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => visibleTreeSet.add(tid));
  
  // Block if record's tree is not in visible set and not empty/unset
  const recordTreeId = e.record.get('tree');
  if (recordTreeId && recordTreeId !== '' && !visibleTreeSet.has(recordTreeId)) {
    throw new NotFoundError('Not found.');
  }
}, 'persons');

onRecordBeforeCreateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  
  // Admin/superuser request: allow unconditionally
  if (!authRecord) {
    return;
  }
  
  const isFamilyAdmin = authRecord.get('family_admin') === true;
  
  // Family admin: allow unconditionally
  if (isFamilyAdmin) {
    return;
  }
  
  // Compute writable tree set for regular users:
  // - user's home_tree (if non-empty)
  // - user's admin_trees array
  // (note: NOT linked_trees — writable is stricter than visible)
  const userHomeTreeId = authRecord.get('home_tree');
  
  const writableTreeSet = new Set();
  
  if (userHomeTreeId && userHomeTreeId !== '') {
    writableTreeSet.add(userHomeTreeId);
  }
  
  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => writableTreeSet.add(tid));
  
  // If tree field is non-empty, it must be in writable set
  const newRecordTreeId = e.record.get('tree');
  if (newRecordTreeId && newRecordTreeId !== '' && !writableTreeSet.has(newRecordTreeId)) {
    throw new ForbiddenError('You do not have permission to create persons in this tree.');
  }
  
  // If tree is empty/unset, allow it through (matches existing app.js create behavior
  // where several call sites do not set tree yet)
}, 'persons');

onRecordBeforeUpdateRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');
  
  // Admin/superuser request: allow unconditionally
  if (!authRecord) {
    return;
  }
  
  const isFamilyAdmin = authRecord.get('family_admin') === true;
  
  // Family admin: allow unconditionally
  if (isFamilyAdmin) {
    return;
  }
  
  // Compute writable tree set for regular users (same as create)
  const userHomeTreeId = authRecord.get('home_tree');
  
  const writableTreeSet = new Set();
  
  if (userHomeTreeId && userHomeTreeId !== '') {
    writableTreeSet.add(userHomeTreeId);
  }
  
  const userAdminTrees = authRecord.get('admin_trees') || [];
  userAdminTrees.forEach((tid) => writableTreeSet.add(tid));
  
  // Check tree write access against the EXISTING record's current tree value
  // (not the incoming patch, which might be an attempt to move between trees)
  const existingRecordTreeId = e.record.get('tree');
  if (existingRecordTreeId && existingRecordTreeId !== '' && !writableTreeSet.has(existingRecordTreeId)) {
    throw new ForbiddenError('You do not have permission to update persons in this tree.');
  }
  
  // Additional check: linked_user field CHANGE requires family_admin OR admin_trees
  // access — a regular user, even one editing their own-tree records, must not be
  // able to self-claim an unlinked person by PATCHing linked_user directly. Must
  // compare against the PERSISTED value (not just "is it non-empty on e.record"),
  // otherwise this would also fire — incorrectly — on any unrelated edit to an
  // already-linked person's record (e.g. someone editing their own linked profile),
  // since e.record in a before-update hook is the merged existing+patch record and
  // its linked_user would still read as non-empty even when untouched by this patch.
  const persistedRecord = $app.dao().findRecordById('persons', e.record.id);
  const persistedLinkedUser = persistedRecord ? persistedRecord.get('linked_user') : '';
  const incomingLinkedUser = e.record.get('linked_user');
  const linkedUserChanged = (persistedLinkedUser || '') !== (incomingLinkedUser || '');

  if (linkedUserChanged) {
    const recordTreeId = e.record.get('tree');
    const hasAdminTreesAccess = userAdminTrees.includes(recordTreeId);
    if (!hasAdminTreesAccess) {
      throw new ForbiddenError('You do not have permission to link persons to users. Contact an administrator.');
    }
  }
}, 'persons');

// Per the capability matrix: regular users get view/create/update on their own tree,
// but delete is admin-only (family_admin, or a branch admin for that specific tree).
onRecordBeforeDeleteRequest((e) => {
  const authRecord = e.httpContext.get('authRecord');

  if (!authRecord) {
    return;
  }

  const isFamilyAdmin = authRecord.get('family_admin') === true;
  if (isFamilyAdmin) {
    return;
  }

  const userAdminTrees = authRecord.get('admin_trees') || [];
  const recordTreeId = e.record.get('tree');

  if (!userAdminTrees.includes(recordTreeId)) {
    throw new ForbiddenError('You do not have permission to delete persons in this tree.');
  }
}, 'persons');
