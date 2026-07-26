/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const albums = dao.findCollectionByNameOrId("albums");
  const trees = dao.findCollectionByNameOrId("trees");

  albums.schema.addField(new SchemaField({
    name: "tree",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: 1, cascadeDelete: false },
  }));

  return dao.saveCollection(albums);
}, (db) => {
  const dao = new Dao(db);
  const albums = dao.findCollectionByNameOrId("albums");
  const field = albums.schema.getFieldByName("tree");
  if (field) {
    albums.schema.removeField(field.id);
  }
  return dao.saveCollection(albums);
});
