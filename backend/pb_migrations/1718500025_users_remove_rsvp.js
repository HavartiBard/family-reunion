/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  // 1718500008 already tried to remove this field (superseded by the
  // per-event `event_rsvps` collection — every RSVP read/write in app.js
  // goes through event_rsvps, never users.rsvp) but used
  // removeField("rsvp"), which silently no-ops: schema.removeField() takes
  // a field ID, not a name (same bug fixed in 1718500024 for
  // branch_admins.branch). rsvp has sat unused in the live schema ever
  // since. Using the correct id-based pattern this time.
  const rsvpField = collection.schema.getFieldByName("rsvp");
  if (rsvpField) {
    collection.schema.removeField(rsvpField.id);
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.addField(new SchemaField({
    name: "rsvp",
    type: "select",
    options: { maxSelect: 1, values: ["going", "maybe", "no"] },
  }));
  return dao.saveCollection(collection);
});
