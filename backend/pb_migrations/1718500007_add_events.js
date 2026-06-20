/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const APPROVED = '@request.auth.id != "" && @request.auth.approved = true';
  const IS_ORGANIZER = 'organizers ~ @request.auth.id';
  const IS_ADMIN = '@request.auth.family_admin = true';

  const events = new Collection({
    name: "events", type: "base",
    listRule: APPROVED, viewRule: APPROVED, createRule: APPROVED,
    updateRule: `${APPROVED} && (${IS_ORGANIZER} || ${IS_ADMIN})`,
    deleteRule: `${APPROVED} && (${IS_ORGANIZER} || ${IS_ADMIN})`,
    schema: [
      { name:"name",        type:"text",     required:true },
      { name:"type",        type:"select",   options:{ maxSelect:1, values:["reunion","birthday","wedding","holiday","other"] } },
      { name:"description", type:"text" },
      { name:"start_date",  type:"text",     required:true },
      { name:"end_date",    type:"text" },
      { name:"location",    type:"text" },
      { name:"cover_photo", type:"file",     options:{ maxSelect:1, maxSize:5242880, mimeTypes:["image/jpeg","image/png","image/webp","image/gif"] } },
      { name:"organizers",  type:"relation", options:{ collectionId:users.id, maxSelect:null, cascadeDelete:false } },
      { name:"created_by",  type:"relation", options:{ collectionId:users.id, maxSelect:1,    cascadeDelete:false } }
    ]
  });
  dao.saveCollection(events);

  const event_rsvps = new Collection({
    name: "event_rsvps", type: "base",
    listRule: APPROVED, viewRule: APPROVED,
    createRule: `@request.auth.id != "" && user = @request.auth.id`,
    updateRule: `@request.auth.id != "" && user = @request.auth.id`,
    deleteRule: `@request.auth.id != "" && user = @request.auth.id`,
    schema: [
      { name:"event",  type:"relation", required:true, options:{ collectionId:events.id,  maxSelect:1, cascadeDelete:true } },
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id,   maxSelect:1, cascadeDelete:true } },
      { name:"status", type:"select",   required:true, options:{ maxSelect:1, values:["going","maybe","no"] } }
    ]
  });
  dao.saveCollection(event_rsvps);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("event_rsvps"));
  dao.deleteCollection(dao.findCollectionByNameOrId("events"));
});
