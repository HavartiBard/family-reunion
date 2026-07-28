/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const users = dao.findCollectionByNameOrId("users");

  events.schema.addField(new SchemaField({
    name: "date_poll_status",
    type: "select",
    required: false,
    options: { maxSelect: 1, values: ["none", "open", "closed"] },
  }));

  events.schema.addField(new SchemaField({
    name: "date_poll_range_start",
    type: "text",
    required: false,
  }));

  events.schema.addField(new SchemaField({
    name: "date_poll_range_end",
    type: "text",
    required: false,
  }));

  events.schema.addField(new SchemaField({
    name: "date_poll_day_start_hour",
    type: "number",
    required: false,
  }));

  events.schema.addField(new SchemaField({
    name: "date_poll_day_end_hour",
    type: "number",
    required: false,
  }));

  events.schema.addField(new SchemaField({
    name: "date_poll_slot_minutes",
    type: "number",
    required: false,
  }));

  const event_availability = new Collection({
    name: "event_availability", type: "base",
    listRule: '@request.auth.id != "" && @request.auth.approved = true',
    viewRule: '@request.auth.id != "" && @request.auth.approved = true',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
    schema: [
      { name:"event",  type:"relation", required:true, options:{ collectionId:events.id,  maxSelect:1, cascadeDelete:true } },
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id,   maxSelect:1, cascadeDelete:true } },
      { name:"slots",  type:"json",     required:false, options:{} },
    ]
  });

  dao.saveCollection(events);
  return dao.saveCollection(event_availability);
}, (db) => {
  const dao = new Dao(db);
  const events = dao.findCollectionByNameOrId("events");
  const field1 = events.schema.getFieldByName("date_poll_status");
  if (field1) {
    events.schema.removeField(field1.id);
  }
  const field2 = events.schema.getFieldByName("date_poll_range_start");
  if (field2) {
    events.schema.removeField(field2.id);
  }
  const field3 = events.schema.getFieldByName("date_poll_range_end");
  if (field3) {
    events.schema.removeField(field3.id);
  }
  const field4 = events.schema.getFieldByName("date_poll_day_start_hour");
  if (field4) {
    events.schema.removeField(field4.id);
  }
  const field5 = events.schema.getFieldByName("date_poll_day_end_hour");
  if (field5) {
    events.schema.removeField(field5.id);
  }
  const field6 = events.schema.getFieldByName("date_poll_slot_minutes");
  if (field6) {
    events.schema.removeField(field6.id);
  }
  dao.saveCollection(events);
  return dao.deleteCollection(dao.findCollectionByNameOrId("event_availability"));
});
