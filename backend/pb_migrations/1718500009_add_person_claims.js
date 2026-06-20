/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users   = dao.findCollectionByNameOrId("users");
  const persons = dao.findCollectionByNameOrId("persons");

  const OWN_OR_ADMIN = '@request.auth.id != "" && (user = @request.auth.id || @request.auth.family_admin = true)';

  const claims = new Collection({
    name: "person_claims", type: "base",
    listRule:   OWN_OR_ADMIN,
    viewRule:   OWN_OR_ADMIN,
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.family_admin = true',
    deleteRule: '@request.auth.family_admin = true',
    schema: [
      { name:"person", type:"relation", required:true, options:{ collectionId:persons.id, maxSelect:1, cascadeDelete:true  } },
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id,   maxSelect:1, cascadeDelete:true  } },
      { name:"status", type:"select",   required:true, options:{ maxSelect:1, values:["pending","approved","denied"] } },
      { name:"note",   type:"text" }
    ]
  });
  dao.saveCollection(claims);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("person_claims"));
});
