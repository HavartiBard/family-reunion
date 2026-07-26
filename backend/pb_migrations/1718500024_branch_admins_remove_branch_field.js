/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("branch_admins");

  // Superseded by the `tree` relation field (1718500021) — every consumer in
  // app.js was rewired to read `.tree` instead of `.branch` (PR #69), and
  // confirmed nothing reads `.branch` anymore before this migration was written.
  // Safe regardless of frontend/backend deploy ordering: verified against a live
  // instance that PocketBase silently ignores an unrecognized field in a create/
  // update payload rather than erroring, so app.js continuing to send
  // `branch: treeName` (harmless, unused) for however long until its own next
  // deploy causes no failures either way.
  //
  // schema.removeField() takes a field ID, not name (confirmed against the
  // JSVM docs) — passing the name silently no-ops. Several older migrations
  // in this repo (e.g. 1718500006/008's `removeField("rsvp")`) have this same
  // bug and never actually dropped their target fields; not fixing those
  // here since it's out of scope, but don't copy that pattern going forward.
  const branchField = collection.schema.getFieldByName("branch");
  if (branchField) {
    collection.schema.removeField(branchField.id);
  }

  return dao.saveCollection(collection);
}, (db) => {
  // PocketBase renames removed fields to __pb_old_* internally — no clean
  // rollback. Re-add as optional (not required, unlike the original) since any
  // rollback at this point has no real branch values to backfill from.
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("branch_admins");
  collection.schema.addField(new SchemaField({
    name: "branch",
    type: "text",
    required: false,
  }));
  return dao.saveCollection(collection);
});
