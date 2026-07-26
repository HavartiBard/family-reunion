/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("person_claims");

  // Widen the base rule to admit any branch admin (non-empty admin_trees) broadly,
  // alongside the existing own-claim and family_admin cases. This is deliberately
  // coarse at the rule level — PocketBase 0.22.20's rule engine cannot reliably
  // compare a record's related field against an auth multi-relation field (confirmed
  // empirically this session; see the Phase 3 plan notes), so precise "is THIS
  // claim's person in THIS admin's specific admin_trees" scoping is done by
  // backend/pb_hooks/person_claims_tree_scope.pb.js, which narrows list/view
  // results and rejects update (approve/deny) requests that don't match. This rule
  // only needs to let branch admins as a class past the base gate; it does not by
  // itself grant access to any specific record.
  const OWN_OR_ADMIN = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.family_admin = true || @request.auth.admin_trees != "")';
  const ADMIN_ONLY = '@request.auth.id != "" && (@request.auth.family_admin = true || @request.auth.admin_trees != "")';

  collection.listRule = OWN_OR_ADMIN;
  collection.viewRule = OWN_OR_ADMIN;
  collection.updateRule = ADMIN_ONLY;
  // deleteRule intentionally left as family_admin-only — denying/removing a claim
  // outright (vs. approving/denying via status update) stays a trunk-admin action.

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("person_claims");
  const OWN_OR_ADMIN = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.family_admin = true)';
  collection.listRule = OWN_OR_ADMIN;
  collection.viewRule = OWN_OR_ADMIN;
  collection.updateRule = '@request.auth.family_admin = true';
  return dao.saveCollection(collection);
});
