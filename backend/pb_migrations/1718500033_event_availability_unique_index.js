/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_availability");
  // 1718500030 created this collection with no indexes at all, so nothing stopped a user
  // from ending up with multiple `event_availability` rows for the same event (e.g. two
  // concurrent saves from the paintable-grid UI), leaving ambiguous/duplicated availability
  // data for that event/user pair. One row per (event, user) is the intended model.
  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_event_availability_event_user` ON `event_availability` (`event`, `user`)"
  ];
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_availability");
  collection.indexes = [];
  return dao.saveCollection(collection);
});
