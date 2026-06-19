/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");

  // A user may only see and modify their own notifications.
  const OWN = "@request.auth.id != \"\" && user = @request.auth.id";

  const notifications = new Collection({
    name: "notifications",
    type: "base",
    listRule: OWN,
    viewRule: OWN,
    createRule: OWN,
    updateRule: OWN,
    deleteRule: OWN,
    schema: [
      { name: "user", type: "relation", required: true,
        options: { collectionId: users.id, maxSelect: 1, cascadeDelete: true } },
      { name: "type", type: "select",
        options: { maxSelect: 1,
          values: ["new_member", "birthday", "news", "photo", "rsvp", "admin"] } },
      { name: "title", type: "text", required: true },
      { name: "body", type: "text" },
      { name: "read", type: "bool" },
      { name: "related_id", type: "text" },
      { name: "related_type", type: "text" }
    ]
  });
  dao.saveCollection(notifications);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("notifications"));
});
