/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  // Both fields already exist on the live/dev databases (added directly through the
  // PocketBase admin dashboard at some point, never captured in a migration) but are
  // missing from any environment built purely from these migrations (fresh Fly volume,
  // CI, disaster recovery). getFieldByName returns null when absent, so this is a
  // no-op everywhere the fields already exist and additive everywhere they don't.
  if (collection.schema.getFieldByName("approved") === null) {
    collection.schema.addField(new SchemaField({
      name: "approved",
      type: "bool",
      options: {},
    }));
  }

  if (collection.schema.getFieldByName("phone") === null) {
    collection.schema.addField(new SchemaField({
      name: "phone",
      type: "text",
      options: { min: null, max: null, pattern: "" },
    }));
  }

  return dao.saveCollection(collection);
}, (db) => {
  // No-op: both fields predate this migration on databases where they were added
  // manually — removing them on rollback would be destructive and inconsistent
  // across environments.
});
