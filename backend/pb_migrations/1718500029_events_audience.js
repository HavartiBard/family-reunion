/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const trees = dao.findCollectionByNameOrId("trees");
  const users = dao.findCollectionByNameOrId("users");

  events.schema.addField(new SchemaField({
    name: "extra_trees",
    type: "relation",
    required: false,
    options: { collectionId: trees.id, maxSelect: null, cascadeDelete: false },
  }));

  events.schema.addField(new SchemaField({
    name: "invite_only",
    type: "bool",
    required: false,
  }));

  const event_invites = new Collection({
    name: "event_invites", type: "base",
    listRule: '@request.auth.id != "" && @request.auth.approved = true',
    viewRule: '@request.auth.id != "" && @request.auth.approved = true',
    createRule: '@request.auth.id != "" && @request.auth.approved = true',
    updateRule: '@request.auth.id != "" && @request.auth.approved = true',
    deleteRule: '@request.auth.id != "" && @request.auth.approved = true',
    indexes: [
      "CREATE UNIQUE INDEX `idx_event_invites_token` ON `event_invites` (`token`)"
    ],
    schema: [
      { name:"event",      type:"relation", required:true,  options:{ collectionId:events.id,   maxSelect:1,    cascadeDelete:true  } },
      { name:"invite_type",type:"select",   required:true,  options:{ maxSelect:1,    values:["user","email"] } },
      { name:"user",       type:"relation", required:false, options:{ collectionId:users.id,    maxSelect:1,    cascadeDelete:false } },
      { name:"email",      type:"text",     required:false, options:{} },
      { name:"guest_name", type:"text",     required:false, options:{} },
      { name:"token",      type:"text",     required:false, options:{} },
      { name:"status",     type:"select",   required:true,  options:{ maxSelect:1,    values:["pending","going","maybe","no"] } },
      { name:"invited_by", type:"relation", required:true,  options:{ collectionId:users.id,    maxSelect:1,    cascadeDelete:false } },
    ]
  });

  dao.saveCollection(events);
  return dao.saveCollection(event_invites);
}, (db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const field1 = events.schema.getFieldByName("extra_trees");
  if (field1) {
    events.schema.removeField(field1.id);
  }
  const field2 = events.schema.getFieldByName("invite_only");
  if (field2) {
    events.schema.removeField(field2.id);
  }
  dao.saveCollection(events);
  return dao.deleteCollection(dao.findCollectionByNameOrId("event_invites"));
});
