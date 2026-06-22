/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const col = dao.findCollectionByNameOrId("photos");
  // Remove the file field; add a differently-named text field to avoid SQLite
  // duplicate-column errors when PocketBase rebuilds the table.
  col.schema.removeField("image");
  col.schema.addField(new SchemaField({
    name: "image_url",
    type: "text",
    required: true,
    options: { max: 2048 }
  }));
  dao.saveCollection(col);
}, (db) => {
  const dao = new Dao(db);
  const col = dao.findCollectionByNameOrId("photos");
  col.schema.removeField("image_url");
  col.schema.addField(new SchemaField({
    name: "image",
    type: "file",
    required: true,
    options: {
      maxSelect: 1,
      maxSize: 10485760,
      mimeTypes: ["image/jpeg","image/png","image/webp","image/gif"]
    }
  }));
  dao.saveCollection(col);
});
