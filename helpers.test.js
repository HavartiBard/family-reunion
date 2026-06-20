// helpers.test.js
const test = require('node:test');
const assert = require('node:assert');
const h = require('./helpers.js');

test('esc escapes HTML metacharacters', () => {
  assert.strictEqual(h.esc('<b> & "x"'), '&lt;b&gt; &amp; "x"');
  assert.strictEqual(h.esc(null), '');
});

test('userInitials takes up to two uppercase initials', () => {
  assert.strictEqual(h.userInitials({ name: 'Jane Q Public' }), 'JQ');
  assert.strictEqual(h.userInitials({ email: 'sam@x.com' }), 'S');
  assert.strictEqual(h.userInitials({}), '?');
});

test('personInitials from display_name', () => {
  assert.strictEqual(h.personInitials({ display_name: 'Walter Bender' }), 'WB');
  assert.strictEqual(h.personInitials({}), '?');
});

test('personYears formats birth and death', () => {
  assert.strictEqual(h.personYears({ birth_date: '1947-03-12', death_date: '2001' }), '1947–2001');
  assert.strictEqual(h.personYears({ birth_date: '1947', living: true }), '1947');
  assert.strictEqual(h.personYears({}), '');
});

test('avatarTint rotates through 6 tints by index % 6', () => {
  const tints = [h.avatarTint(0), h.avatarTint(1), h.avatarTint(2),
                 h.avatarTint(3), h.avatarTint(4), h.avatarTint(5)];
  assert.strictEqual(new Set(tints).size, 6);          // 6 distinct
  assert.strictEqual(h.avatarTint(6), h.avatarTint(0)); // wraps
  assert.match(h.avatarTint(0), /^#[0-9a-f]{6}$/i);     // hex
});

test('daysUntil counts whole days, floored at 0', () => {
  const now = new Date('2026-06-19T12:00:00Z');
  assert.strictEqual(h.daysUntil('2026-06-20', now), 1);
  assert.strictEqual(h.daysUntil('2026-06-19', now), 0);
  assert.strictEqual(h.daysUntil('2026-06-01', now), 0); // past -> 0, never negative
});

test('filterPeople matches name, bio, and birth year', () => {
  const people = [
    { display_name: 'Walter Bender', given_name: 'Walter', family_name: 'Bender', bio: 'founder', birth_date: '1947' },
    { display_name: 'Susan Kelsall', given_name: 'Susan', family_name: 'Kelsall', bio: '', birth_date: '1971' }
  ];
  assert.strictEqual(h.filterPeople(people, 'kelsall').length, 1);
  assert.strictEqual(h.filterPeople(people, 'WALTER')[0].display_name, 'Walter Bender');
  assert.strictEqual(h.filterPeople(people, '1947').length, 1);
  assert.strictEqual(h.filterPeople(people, 'founder').length, 1);
  assert.strictEqual(h.filterPeople(people, '').length, 2); // empty -> all
});

test('filterNews matches title and body', () => {
  const news = [{ title: 'Reunion', body: 'come' }, { title: 'Recipe', body: 'pie' }];
  assert.strictEqual(h.filterNews(news, 'reunion').length, 1);
  assert.strictEqual(h.filterNews(news, 'pie').length, 1);
});

test('groupNotifications buckets by recency', () => {
  const now = new Date('2026-06-19T12:00:00Z');
  const notes = [
    { id: 'a', created: '2026-06-19 09:00:00.000Z' }, // today
    { id: 'b', created: '2026-06-16 09:00:00.000Z' }, // this week (within 7d, not today)
    { id: 'c', created: '2026-05-01 09:00:00.000Z' }  // earlier
  ];
  const g = h.groupNotifications(notes, now);
  assert.deepStrictEqual(g.today.map(n => n.id), ['a']);
  assert.deepStrictEqual(g.week.map(n => n.id), ['b']);
  assert.deepStrictEqual(g.earlier.map(n => n.id), ['c']);
});

test('default privacy and notif prefs', () => {
  assert.deepStrictEqual(h.defaultPrivacy(), { phone: 'family', address: 'admins', directory: 'family' });
  assert.deepStrictEqual(h.defaultNotifPrefs(), { birthdays: true, new_members: true, photos: true, reunion: true });
});
