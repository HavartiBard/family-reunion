/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const APPROVED = '@request.auth.id != "" && @request.auth.approved = true';
  const IS_ADMIN = '@request.auth.family_admin = true';
  const IS_SELF  = 'user = @request.auth.id';

  const branch_admins = new Collection({
    name: "branch_admins", type: "base",
    listRule:   `${APPROVED} && (${IS_ADMIN} || ${IS_SELF})`,
    viewRule:   `${APPROVED} && (${IS_ADMIN} || ${IS_SELF})`,
    createRule: `${APPROVED} && ${IS_ADMIN}`,
    updateRule: `${APPROVED} && ${IS_ADMIN}`,
    deleteRule: `${APPROVED} && ${IS_ADMIN}`,
    schema: [
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id, maxSelect:1, cascadeDelete:true } },
      { name:"branch", type:"text",     required:true }
    ]
  });
  dao.saveCollection(branch_admins);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("branch_admins"));
});
