/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_rsvps");

  // family_admin needs to be able to fix/remove RSVPs on behalf of people,
  // e.g. correcting a stray status for someone without an account
  const UPDATE_DELETE_ADMIN_OVERRIDE = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.family_admin = true)';

  collection.updateRule = UPDATE_DELETE_ADMIN_OVERRIDE;
  collection.deleteRule = UPDATE_DELETE_ADMIN_OVERRIDE;

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_rsvps");

  collection.updateRule = '@request.auth.id != "" && user = @request.auth.id';
  collection.deleteRule = '@request.auth.id != "" && user = @request.auth.id';

  return dao.saveCollection(collection);
});
