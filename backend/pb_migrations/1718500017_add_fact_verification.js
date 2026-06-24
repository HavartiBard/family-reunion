/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("person_facts");

  collection.schema.addField(new SchemaField({
    name: "ai_generated",
    type: "bool",
    options: { noInit: false },
  }));
  collection.schema.addField(new SchemaField({
    name: "verified",
    type: "bool",
    options: { noInit: false },
  }));

  return dao.saveCollection(collection);
}, (db) => {
  // PocketBase renames removed fields to __pb_old_* — no clean rollback
});
