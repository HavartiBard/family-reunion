/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const news = dao.findCollectionByNameOrId("news");
  const trees = dao.findCollectionByNameOrId("trees");

  news.schema.addField(new SchemaField({
    name: "tree",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: 1, cascadeDelete: false },
  }));

  return dao.saveCollection(news);
}, (db) => {
  const dao = new Dao(db);
  const news = dao.findCollectionByNameOrId("news");
  const field = news.schema.getFieldByName("tree");
  if (field) {
    news.schema.removeField(field.id);
  }
  return dao.saveCollection(news);
});
