/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.removeField("rsvp");
  dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.addField(new SchemaField({
    name: "rsvp", type: "select",
    options: { maxSelect: 1, values: ["going","maybe","no"] }
  }));
  dao.saveCollection(collection);
});
