/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const persons = dao.findCollectionByNameOrId("persons");
  const RULE = "@request.auth.id != \"\" && @request.auth.approved = true";

  const FACT_TYPES = [
    "birth","death","burial","cremation",
    "baptism","christening","christening_adult","bar_mitzvah","bat_mitzvah",
    "confirmation","first_communion","blessing","ordination",
    "adoption","immigration","emigration","naturalization","military",
    "graduation","retirement","census","will","probate","residence","property",
    "marriage","divorce","engagement","annulment",
    "occupation","education","religion","nationality","title",
    "physical_description","medical","ssn","national_id",
    "address","website","email","phone","note","other"
  ];

  const collection = new Collection({
    name: "person_facts",
    type: "base",
    listRule: RULE,
    viewRule: RULE,
    createRule: RULE,
    updateRule: RULE,
    deleteRule: RULE,
    schema: [
      { name: "person", type: "relation", required: true,
        options: { collectionId: persons.id, maxSelect: 1, cascadeDelete: true } },
      { name: "fact_type", type: "select", required: true,
        options: { maxSelect: 1, values: FACT_TYPES } },
      { name: "date_text", type: "text" },
      { name: "sort_year", type: "number" },
      { name: "place", type: "text" },
      { name: "value", type: "text" },
      { name: "description", type: "text" },
      { name: "source", type: "text" }
    ]
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("person_facts"));
});
