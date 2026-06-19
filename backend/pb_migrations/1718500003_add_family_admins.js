/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.addField(new SchemaField({
    name: "family_admin",
    type: "bool"
  }));

  const LOGGED_IN = "@request.auth.id != \"\"";
  const IS_APPROVED = "@request.auth.approved = true";
  const IS_ADMIN = "@request.auth.family_admin = true";
  const IS_SELF = "id = @request.auth.id";

  collection.listRule = `${LOGGED_IN} && (${IS_SELF} || (${IS_APPROVED} && (approved = true || ${IS_ADMIN})))`;
  collection.viewRule = collection.listRule;
  collection.updateRule = `${LOGGED_IN} && (` +
    `(${IS_SELF} && @request.data.approved:isset = false && @request.data.family_admin:isset = false) || ` +
    `(${IS_APPROVED} && ${IS_ADMIN})` +
  `)`;

  dao.saveCollection(collection);

  try {
    const james = dao.findFirstRecordByData("users", "email", "james@klsll.com");
    james.set("approved", true);
    james.set("family_admin", true);
    dao.saveRecord(james);
  } catch (_) {
    // The production account is seeded when present; fresh installs can promote later.
  }
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.removeField("family_admin");
  collection.listRule = null;
  collection.viewRule = null;
  collection.updateRule = null;

  return dao.saveCollection(collection);
});
