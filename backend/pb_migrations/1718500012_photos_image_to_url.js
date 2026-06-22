/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  // Step 1: remove the file field and save
  const col1 = dao.findCollectionByNameOrId("photos");
  col1.schema.removeField("image");
  dao.saveCollection(col1);

  // Step 2: re-fetch and add a text field with the same name
  const col2 = dao.findCollectionByNameOrId("photos");
  col2.schema.addField(new SchemaField({
    name: "image",
    type: "text",
    required: true,
    options: { max: 2048 }
  }));
  dao.saveCollection(col2);
}, (db) => {
  const dao = new Dao(db);

  // Step 1: remove text field and save
  const col1 = dao.findCollectionByNameOrId("photos");
  col1.schema.removeField("image");
  dao.saveCollection(col1);

  // Step 2: re-fetch and restore file field
  const col2 = dao.findCollectionByNameOrId("photos");
  col2.schema.addField(new SchemaField({
    name: "image",
    type: "file",
    required: true,
    options: {
      maxSelect: 1,
      maxSize: 10485760,
      mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"]
    }
  }));
  dao.saveCollection(col2);
});
