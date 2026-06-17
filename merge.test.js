const test = require('node:test');
const assert = require('node:assert');
const { computeMergeWrites } = require('./merge.js');

test('relinks children, couples, and claim from duplicate to survivor', () => {
  const survivor = { id: 'S' };
  const duplicate = { id: 'D', linked_user: 'U9' };
  const childrenOfDup = [
    { id: 'c1', father: 'D', mother: 'M2' },
    { id: 'c2', father: 'F3', mother: 'D' },
  ];
  const couplesOfDup = [
    { id: 'k1', partner_a: 'D', partner_b: 'P1' },
    { id: 'k2', partner_a: 'P2', partner_b: 'D' },
  ];
  const writes = computeMergeWrites(survivor, duplicate, childrenOfDup, couplesOfDup);

  assert.deepStrictEqual(writes.persons, [
    { id: 'c1', fields: { father: 'S' } },
    { id: 'c2', fields: { mother: 'S' } },
  ]);
  assert.deepStrictEqual(writes.couples, [
    { id: 'k1', fields: { partner_a: 'S' } },
    { id: 'k2', fields: { partner_b: 'S' } },
  ]);
  assert.deepStrictEqual(writes.survivorFields, { linked_user: 'U9' });
  assert.deepStrictEqual(writes.deletePersonId, 'D');
});

test('does not move claim when survivor already claimed', () => {
  const writes = computeMergeWrites(
    { id: 'S', linked_user: 'U1' }, { id: 'D', linked_user: 'U9' }, [], []);
  assert.deepStrictEqual(writes.survivorFields, {});
});

test('no-op edges produce empty write lists', () => {
  const writes = computeMergeWrites({ id: 'S' }, { id: 'D' }, [], []);
  assert.deepStrictEqual(writes.persons, []);
  assert.deepStrictEqual(writes.couples, []);
  assert.strictEqual(writes.deletePersonId, 'D');
});
