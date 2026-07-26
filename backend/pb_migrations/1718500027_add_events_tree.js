/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const trees = dao.findCollectionByNameOrId("trees");

  events.schema.addField(new SchemaField({
    name: "tree",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: 1, cascadeDelete: false },
  }));

  return dao.saveCollection(events);
}, (db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const field = events.schema.getFieldByName("tree");
  if (field) {
    events.schema.removeField(field.id);
  }
  return dao.saveCollection(events);
});
