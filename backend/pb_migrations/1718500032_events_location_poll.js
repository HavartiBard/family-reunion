/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const users = dao.findCollectionByNameOrId("users");

  events.schema.addField(new SchemaField({
    name: "location_poll_status",
    type: "select",
    required: false,
    options: { maxSelect: 1, values: ["none", "open", "closed"] },
  }));

  const event_location_suggestions = new Collection({
    name: "event_location_suggestions", type: "base",
    listRule: '@request.auth.id != "" && @request.auth.approved = true',
    viewRule: '@request.auth.id != "" && @request.auth.approved = true',
    createRule: '@request.auth.id != "" && @request.auth.approved = true',
    updateRule: '@request.auth.id != "" && suggested_by = @request.auth.id',
    deleteRule: '@request.auth.id != "" && suggested_by = @request.auth.id',
    schema: [
      { name:"event",        type:"relation", required:true,  options:{ collectionId:events.id,   maxSelect:1,    cascadeDelete:true  } },
      { name:"suggested_by", type:"relation", required:true,  options:{ collectionId:users.id,    maxSelect:1,    cascadeDelete:true  } },
      { name:"name",         type:"text",     required:true,  options:{} },
      { name:"address",      type:"text",     required:false, options:{} },
      { name:"url",          type:"text",     required:false, options:{} },
      { name:"notes",        type:"text",     required:false, options:{} },
      { name:"capacity",     type:"number",   required:false, options:{} },
    ]
  });

  const comments = dao.findCollectionByNameOrId("comments");
  const field = comments.schema.getFieldByName("related_type");
  field.options.values.push("event_location_suggestion");
  dao.saveCollection(comments);

  dao.saveCollection(events);

  // event_location_suggestions must be saved BEFORE event_location_votes is even
  // constructed — a brand-new (not-yet-saved) Collection's .id is empty, so building
  // event_location_votes' `suggestion` relation against event_location_suggestions.id
  // here would bake in an empty collectionId (confirmed empirically: the relation
  // field's collectionId came back as '' on a real scratch-container run before this
  // reorder), silently producing a relation field that points at nothing.
  dao.saveCollection(event_location_suggestions);

  const event_location_votes = new Collection({
    name: "event_location_votes", type: "base",
    listRule: '@request.auth.id != "" && @request.auth.approved = true',
    viewRule: '@request.auth.id != "" && @request.auth.approved = true',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
    indexes: [
      "CREATE UNIQUE INDEX `idx_event_location_votes_suggestion_user` ON `event_location_votes` (`suggestion`, `user`)"
    ],
    schema: [
      { name:"suggestion", type:"relation", required:true,  options:{ collectionId:event_location_suggestions.id,   maxSelect:1,    cascadeDelete:true  } },
      { name:"user",       type:"relation", required:true,  options:{ collectionId:users.id,    maxSelect:1,    cascadeDelete:true  } },
    ]
  });

  return dao.saveCollection(event_location_votes);
}, (db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const field1 = events.schema.getFieldByName("location_poll_status");
  if (field1) {
    events.schema.removeField(field1.id);
  }
  dao.saveCollection(events);

  const event_location_suggestions = dao.findCollectionByNameOrId("event_location_suggestions");
  dao.deleteCollection(event_location_suggestions);

  const event_location_votes = dao.findCollectionByNameOrId("event_location_votes");
  dao.deleteCollection(event_location_votes);

  const comments = dao.findCollectionByNameOrId("comments");
  const field2 = comments.schema.getFieldByName("related_type");
  field2.options.values = field2.options.values.filter(v => v !== "event_location_suggestion");
  return dao.saveCollection(comments);
});
