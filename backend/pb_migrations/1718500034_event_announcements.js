/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const users = dao.findCollectionByNameOrId("users");

  const event_announcements = new Collection({
    name: "event_announcements", type: "base",
    listRule: '@request.auth.id != "" && @request.auth.approved = true',
    viewRule: '@request.auth.id != "" && @request.auth.approved = true',
    createRule: '@request.auth.id != "" && @request.auth.approved = true',
    deleteRule: '@request.auth.id != "" && @request.auth.approved = true',
    schema: [
      { name:"event",      type:"relation", required:true,  options:{ collectionId:events.id,   maxSelect:1,    cascadeDelete:true  } },
      { name:"created_by", type:"relation", required:true,  options:{ collectionId:users.id,    maxSelect:1,    cascadeDelete:true  } },
      { name:"title",      type:"text",     required:true,  options:{} },
      { name:"body",       type:"text",     required:true,  options:{} },
      { name:"send_at",    type:"date",     required:true,  options:{} },
      { name:"sent",       type:"bool",     required:false },
    ]
  });

  const notifications = dao.findCollectionByNameOrId("notifications");
  const field = notifications.schema.getFieldByName("type");
  field.options.values.push("event_announcement");
  field.options.values.push("event_poll");
  dao.saveCollection(notifications);

  return dao.saveCollection(event_announcements);
}, (db) => {
  const dao = new Dao(db);
  const notifications = dao.findCollectionByNameOrId("notifications");
  const field = notifications.schema.getFieldByName("type");
  field.options.values = field.options.values.filter(v => v !== "event_announcement" && v !== "event_poll");
  dao.saveCollection(notifications);
  return dao.deleteCollection(dao.findCollectionByNameOrId("event_announcements"));
});
