/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const trees = dao.findCollectionByNameOrId("trees");

  trees.schema.addField(new SchemaField({
    name: "linked_trees",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: null, cascadeDelete: false },
  }));

  return dao.saveCollection(trees);
}, (db) => {
  const dao = new Dao(db);
  const col = dao.findCollectionByNameOrId("trees");
  col.schema.removeField("linked_trees");
  return dao.saveCollection(col);
});
