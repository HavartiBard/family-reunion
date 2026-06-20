/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.addField(new SchemaField({
    name: "rsvp",
    type: "select",
    options: { maxSelect: 1, values: ["going", "maybe", "no"] }
  }));
  collection.schema.addField(new SchemaField({
    name: "privacy_settings",
    type: "json",
    options: { maxSize: 2000 }
  }));
  collection.schema.addField(new SchemaField({
    name: "notification_prefs",
    type: "json",
    options: { maxSize: 2000 }
  }));

  dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.removeField("rsvp");
  collection.schema.removeField("privacy_settings");
  collection.schema.removeField("notification_prefs");
  return dao.saveCollection(collection);
});
