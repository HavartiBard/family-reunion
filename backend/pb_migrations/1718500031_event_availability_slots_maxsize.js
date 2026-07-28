/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_availability");
  const field = collection.schema.getFieldByName("slots");
  // 1718500030 created this field with options:{} (no explicit maxSize), which
  // PocketBase's JSON field defaults to maxSize: 0 - a literal 0-byte limit, not
  // "unlimited". Every write failed with "The maximum allowed JSON size is 0 bytes".
  // Match the existing json-field convention (users.privacy_settings/
  // notification_prefs use maxSize: 2000) - sized generously here since `slots`
  // can hold many ISO datetime strings for a wide poll range/fine granularity.
  if (field) {
    field.options = { maxSize: 20000 };
  }
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_availability");
  const field = collection.schema.getFieldByName("slots");
  if (field) {
    field.options = {};
  }
  return dao.saveCollection(collection);
});
