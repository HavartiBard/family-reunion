/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("persons");

  collection.schema.addField(new SchemaField({ name: "middle_name", type: "text" }));
  collection.schema.addField(new SchemaField({ name: "birth_surname", type: "text" }));

  return dao.saveCollection(collection);
}, (db) => {
  // No clean rollback for field removal (PocketBase renames to __pb_old_*)
});
