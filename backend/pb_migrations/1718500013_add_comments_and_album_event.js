/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const albums = dao.findCollectionByNameOrId("albums");
  const photos = dao.findCollectionByNameOrId("photos");

  const APPROVED = "@request.auth.id != \"\" && @request.auth.approved = true";
  const IS_ADMIN = "@request.auth.family_admin = true";

  // Add event relation + cover_photo_url to albums
  let events;
  try { events = dao.findCollectionByNameOrId("events"); } catch {}
  if (events) {
    albums.schema.addField(new SchemaField({
      name: "event",
      type: "relation",
      options: { collectionId: events.id, maxSelect: 1, cascadeDelete: false }
    }));
  }
  albums.schema.addField(new SchemaField({
    name: "cover_photo_url",
    type: "text",
    options: { max: 2048 }
  }));
  dao.saveCollection(albums);

  // Create comments collection (shared for photos and albums)
  const comments = new Collection({
    name: "comments",
    type: "base",
    listRule: APPROVED,
    viewRule: APPROVED,
    createRule: APPROVED,
    updateRule: `${APPROVED} && author = @request.auth.id`,
    deleteRule: `${APPROVED} && (author = @request.auth.id || ${IS_ADMIN})`,
    schema: [
      { name: "body", type: "text", required: true, options: { min: 1, max: 2000 } },
      { name: "author", type: "relation", required: true,
        options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false } },
      { name: "related_id", type: "text", required: true },
      { name: "related_type", type: "select", required: true,
        options: { maxSelect: 1, values: ["photo", "album"] } }
    ]
  });
  dao.saveCollection(comments);
}, (db) => {
  const dao = new Dao(db);
  try { dao.deleteCollection(dao.findCollectionByNameOrId("comments")); } catch {}
  try {
    const albums = dao.findCollectionByNameOrId("albums");
    albums.schema.removeField("event");
    albums.schema.removeField("cover_photo_url");
    dao.saveCollection(albums);
  } catch {}
});
