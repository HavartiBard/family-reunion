// merge.js — pure merge-write computation, no DOM, no network.
// Loadable in the browser (global) and in Node (module.exports).
(function (root) {
  function computeMergeWrites(survivor, duplicate, childrenOfDup, couplesOfDup) {
    const persons = [];
    for (const c of childrenOfDup) {
      if (c.father === duplicate.id) persons.push({ id: c.id, fields: { father: survivor.id } });
      else if (c.mother === duplicate.id) persons.push({ id: c.id, fields: { mother: survivor.id } });
    }
    const couples = [];
    for (const k of couplesOfDup) {
      if (k.partner_a === duplicate.id) couples.push({ id: k.id, fields: { partner_a: survivor.id } });
      else if (k.partner_b === duplicate.id) couples.push({ id: k.id, fields: { partner_b: survivor.id } });
    }
    const survivorFields = {};
    if (!survivor.linked_user && duplicate.linked_user) {
      survivorFields.linked_user = duplicate.linked_user;
    }
    return { persons, couples, survivorFields, deletePersonId: duplicate.id };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { computeMergeWrites };
  else root.computeMergeWrites = computeMergeWrites;
})(typeof globalThis !== 'undefined' ? globalThis : this);
