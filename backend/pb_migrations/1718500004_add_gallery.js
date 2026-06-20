/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const persons = dao.findCollectionByNameOrId("persons");

  const APPROVED = "@request.auth.id != \"\" && @request.auth.approved = true";
  const IS_ADMIN = "@request.auth.family_admin = true";

  // albums: any approved member reads; only family_admin writes.
  const albums = new Collection({
    name: "albums",
    type: "base",
    listRule: APPROVED,
    viewRule: APPROVED,
    createRule: `${APPROVED} && ${IS_ADMIN}`,
    updateRule: `${APPROVED} && ${IS_ADMIN}`,
    deleteRule: `${APPROVED} && ${IS_ADMIN}`,
    schema: [
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "year", type: "number" },
      { name: "cover_photo", type: "file",
        options: { maxSelect: 1, maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } }
    ]
  });
  dao.saveCollection(albums);

  // photos: any approved member reads & uploads; uploader or admin edits/deletes.
  const photos = new Collection({
    name: "photos",
    type: "base",
    listRule: APPROVED,
    viewRule: APPROVED,
    createRule: APPROVED,
    updateRule: `${APPROVED} && (uploader = @request.auth.id || ${IS_ADMIN})`,
    deleteRule: `${APPROVED} && (uploader = @request.auth.id || ${IS_ADMIN})`,
    schema: [
      { name: "album", type: "relation", required: true,
        options: { collectionId: albums.id, maxSelect: 1, cascadeDelete: true } },
      { name: "image", type: "file", required: true,
        options: { maxSelect: 1, maxSize: 10485760,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } },
      { name: "caption", type: "text" },
      { name: "taken_date", type: "text" },
      { name: "uploader", type: "relation",
        options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false } },
      { name: "tagged_persons", type: "relation",
        options: { collectionId: persons.id, maxSelect: null, cascadeDelete: false } }
    ]
  });
  dao.saveCollection(photos);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("photos"));
  dao.deleteCollection(dao.findCollectionByNameOrId("albums"));
});
