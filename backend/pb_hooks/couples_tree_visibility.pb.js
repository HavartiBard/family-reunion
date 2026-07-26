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

  // Filter records: keep if at least one partner's tree is in visibleTreeSet
  // OR either partner has no tree set (unassigned persons stay visible)
  // OR either partner lookup fails (fail open on data inconsistency)
  const filtered = e.records.filter((record) => {
    const partnerAId = record.get('partner_a');
    const partnerBId = record.get('partner_b');

    // Helper to check visibility of a partner
    const isPartnerVisible = (partnerId) => {
      if (!partnerId || partnerId === '') {
        // No partner assigned — treat as visible (unassigned is safe)
        return true;
      }
      try {
        const partner = userDao.findRecordById('persons', partnerId);
        if (!partner) {
          // Partner lookup failed — fail open, treat as visible
          return true;
        }
        const partnerTreeId = partner.get('tree');
        if (!partnerTreeId || partnerTreeId === '') {
          // Partner has no tree assigned — treat as visible (grace period)
          return true;
        }
        return visibleTreeSet.has(partnerTreeId);
      } catch (lookupErr) {
        // Lookup error — fail open
        return true;
      }
    };

    // Keep record if at least one partner is visible
    return isPartnerVisible(partnerAId) || isPartnerVisible(partnerBId);
  });

  // CRITICAL: must set both items and totalItems to affect the HTTP response
  e.result.items = filtered;
  e.result.totalItems = filtered.length;
}, 'couples');

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

  // Check visibility of both partners
  const partnerAId = e.record.get('partner_a');
  const partnerBId = e.record.get('partner_b');
  const userDao = $app.dao();

  const isPartnerVisible = (partnerId) => {
    if (!partnerId || partnerId === '') {
      return true;
    }
    try {
      const partner = userDao.findRecordById('persons', partnerId);
      if (!partner) {
        return true;
      }
      const partnerTreeId = partner.get('tree');
      if (!partnerTreeId || partnerTreeId === '') {
        return true;
      }
      return visibleTreeSet.has(partnerTreeId);
    } catch (lookupErr) {
      return true;
    }
  };

  const partnerAVisible = isPartnerVisible(partnerAId);
  const partnerBVisible = isPartnerVisible(partnerBId);

  // Block if neither partner is visible
  if (!partnerAVisible && !partnerBVisible) {
    throw new NotFoundError('Not found.');
  }
}, 'couples');

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

  // Check both partners' trees against writable set
  const partnerAId = e.record.get('partner_a');
  const partnerBId = e.record.get('partner_b');
  const userDao = $app.dao();

  const isPartnerWritable = (partnerId) => {
    if (!partnerId || partnerId === '') {
      // No partner assigned — treat as satisfying the check (unassigned is safe)
      return true;
    }
    try {
      const partner = userDao.findRecordById('persons', partnerId);
      if (!partner) {
        // Partner lookup failed — fail open, treat as writable
        return true;
      }
      const partnerTreeId = partner.get('tree');
      if (!partnerTreeId || partnerTreeId === '') {
        // Partner has no tree assigned — treat as satisfying the check (grace period)
        return true;
      }
      return writableTreeSet.has(partnerTreeId);
    } catch (lookupErr) {
      // Lookup error — fail open
      return true;
    }
  };

  const partnerAWritable = isPartnerWritable(partnerAId);
  const partnerBWritable = isPartnerWritable(partnerBId);

  // Require at least one partner to be writable
  if (!partnerAWritable && !partnerBWritable) {
    throw new ForbiddenError('You do not have permission to create couples in these trees.');
  }
}, 'couples');

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

  // Check tree write access against the EXISTING record's current partner_a/partner_b
  // (fetch the persisted couples record to get the pre-patch partner values)
  const persistedRecord = $app.dao().findRecordById('couples', e.record.id);
  const persistedPartnerAId = persistedRecord ? persistedRecord.get('partner_a') : '';
  const persistedPartnerBId = persistedRecord ? persistedRecord.get('partner_b') : '';

  const userDao = $app.dao();

  const isPartnerWritable = (partnerId) => {
    if (!partnerId || partnerId === '') {
      return true;
    }
    try {
      const partner = userDao.findRecordById('persons', partnerId);
      if (!partner) {
        return true;
      }
      const partnerTreeId = partner.get('tree');
      if (!partnerTreeId || partnerTreeId === '') {
        return true;
      }
      return writableTreeSet.has(partnerTreeId);
    } catch (lookupErr) {
      return true;
    }
  };

  const persistedPartnerAWritable = isPartnerWritable(persistedPartnerAId);
  const persistedPartnerBWritable = isPartnerWritable(persistedPartnerBId);

  // Require at least one partner to be writable against the existing record
  if (!persistedPartnerAWritable && !persistedPartnerBWritable) {
    throw new ForbiddenError('You do not have permission to update couples in these trees.');
  }
}, 'couples');

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
  const userDao = $app.dao();

  // Check both partners' trees against admin_trees
  const partnerAId = e.record.get('partner_a');
  const partnerBId = e.record.get('partner_b');

  const isPartnerInAdminTree = (partnerId) => {
    if (!partnerId || partnerId === '') {
      // No partner assigned — treat as satisfying the check (unassigned is safe)
      return true;
    }
    try {
      const partner = userDao.findRecordById('persons', partnerId);
      if (!partner) {
        // Partner lookup failed — fail open
        return true;
      }
      const partnerTreeId = partner.get('tree');
      if (!partnerTreeId || partnerTreeId === '') {
        // Partner has no tree assigned — treat as satisfying the check (grace period)
        return true;
      }
      return userAdminTrees.includes(partnerTreeId);
    } catch (lookupErr) {
      return true;
    }
  };

  const partnerAInAdminTree = isPartnerInAdminTree(partnerAId);
  const partnerBInAdminTree = isPartnerInAdminTree(partnerBId);

  // Require at least one partner to be in an admin tree
  if (!partnerAInAdminTree && !partnerBInAdminTree) {
    throw new ForbiddenError('You do not have permission to delete couples in these trees.');
  }
}, 'couples');
