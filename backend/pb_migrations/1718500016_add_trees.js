/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const persons = dao.findCollectionByNameOrId("persons");
  const users   = dao.findCollectionByNameOrId("users");
  const RULE       = `@request.auth.id != "" && @request.auth.approved = true`;
  const ADMIN_RULE = `@request.auth.id != "" && @request.auth.approved = true && @request.auth.family_admin = true`;

  const collection = new Collection({
    name: "trees",
    type: "base",
    listRule:   RULE,
    viewRule:   RULE,
    createRule: ADMIN_RULE,
    updateRule: ADMIN_RULE,
    deleteRule: ADMIN_RULE,
    schema: [
      { name: "name",        type: "text",     required: true,  options: { min: 1 } },
      { name: "surname",     type: "text",     required: false },
      { name: "color",       type: "text",     required: false },
      { name: "description", type: "text",     required: false },
      { name: "root_person", type: "relation", required: false,
        options: { collectionId: persons.id, maxSelect: 1, cascadeDelete: false } },
      { name: "created_by",  type: "relation", required: false,
        options: { collectionId: users.id,    maxSelect: 1, cascadeDelete: false } },
    ],
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const col = dao.findCollectionByNameOrId("trees");
  return dao.deleteCollection(col);
});
