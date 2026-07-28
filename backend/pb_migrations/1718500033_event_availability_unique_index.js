/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("event_availability");

  // Any dev/prod database that already hit the concurrent-click race this index is meant
  // to close (two rapid POSTs each observing "no record yet") may already contain duplicate
  // (event, user) rows. Creating a UNIQUE index over existing duplicates fails outright,
  // and per this repo's convention a failing migration takes the whole PocketBase instance
  // down (health endpoint 502s) with no partial-failure tolerance — so duplicates must be
  // collapsed BEFORE the index is created, not left for the index creation to reject.
  // Keep the most recently updated row per pair (the "current" answer for that user) and
  // delete the rest.
  db.newQuery(`
    DELETE FROM event_availability
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY event, user ORDER BY updated DESC) AS rn
        FROM event_availability
      ) WHERE rn = 1
    )
  `).execute();

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
