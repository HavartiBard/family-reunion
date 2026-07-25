/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("branch_admins");
  const trees = dao.findCollectionByNameOrId("trees");

  collection.schema.addField(new SchemaField({
    name: "tree",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: null, cascadeDelete: false },
  }));

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const col = dao.findCollectionByNameOrId("branch_admins");
  col.schema.removeField("tree");
  return dao.saveCollection(col);
});
