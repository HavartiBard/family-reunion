/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("photos");
  // Remove the file field
  collection.schema.removeField("image");
  // Add a text field with the same name to store the R2 URL
  collection.schema.addField(new SchemaField({
    name: "image",
    type: "text",
    required: true,
    options: { max: 2048 }
  }));
  dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("photos");
  collection.schema.removeField("image");
  collection.schema.addField(new SchemaField({
    name: "image",
    type: "file",
    required: true,
    options: {
      maxSelect: 1,
      maxSize: 10485760,
      mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"]
    }
  }));
  dao.saveCollection(collection);
});
