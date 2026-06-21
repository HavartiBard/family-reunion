/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("photos");
  collection.schema.addField(new SchemaField({
    name: "source_path",
    type: "text",
    options: { max: 1024 }
  }));
  dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("photos");
  collection.schema.removeField("source_path");
  dao.saveCollection(collection);
});
