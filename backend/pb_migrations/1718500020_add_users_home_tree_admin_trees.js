/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const trees = dao.findCollectionByNameOrId("trees");

  users.schema.addField(new SchemaField({
    name: "home_tree",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: 1, cascadeDelete: false },
  }));

  users.schema.addField(new SchemaField({
    name: "admin_trees",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: null, cascadeDelete: false },
  }));

  return dao.saveCollection(users);
}, (db) => {
  const dao = new Dao(db);
  const col = dao.findCollectionByNameOrId("users");
  col.schema.removeField("home_tree");
  col.schema.removeField("admin_trees");
  return dao.saveCollection(col);
});
