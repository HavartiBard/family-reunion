// helpers.test.js
const test = require('node:test');
const assert = require('node:assert');
const h = require('./helpers.js');

test('esc escapes HTML metacharacters', () => {
  assert.strictEqual(h.esc('<b> & "x"'), '&lt;b&gt; &amp; "x"');
  assert.strictEqual(h.esc(null), '');
});

test('escAttr escapes quotes in addition to HTML metacharacters', () => {
  assert.strictEqual(h.escAttr(`<b> & "x" 'y'`), '&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39;');
  assert.strictEqual(h.escAttr(null), '');
  // A crafted attribute-breakout attempt must not leave a live quote in the output.
  assert.ok(!h.escAttr('" autofocus onfocus=alert(1) x="').includes('"'));
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
  assert.strictEqual(h.personYears({ birth_date: '1947', living: true }), '1947–Living');
  assert.strictEqual(h.personYears({ birth_date: '1947' }), '1947–Living');
  assert.strictEqual(h.personYears({ death_date: '2001' }), '?–2001');
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

test('fmtEventDate formats short (default) and long-with-time variants', () => {
  // fmtEventDate renders in the host's local timezone (correctly), so the expected
  // short/long labels must be derived the same way rather than hardcoded — hardcoding
  // "Sep 1" broke under e.g. `TZ=Asia/Tokyo node --test helpers.test.js`, where this UTC
  // instant is already Sep 2 locally.
  const iso = '2026-09-01T18:00:00Z';
  const date = new Date(iso);
  const expectedShort = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const expectedLongPrefix = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  assert.strictEqual(h.fmtEventDate(iso), expectedShort);
  assert.ok(h.fmtEventDate(iso, { withTime: true }).startsWith(expectedLongPrefix));
  assert.strictEqual(h.fmtEventDate(''), '');
  assert.strictEqual(h.fmtEventDate(null), '');
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

test('darkenHex darkens a hex color by a percentage', () => {
  assert.strictEqual(h.darkenHex('#c8952a', 0.18), '#a47a22');
  assert.strictEqual(h.darkenHex('#000000', 0.5), '#000000'); // already black, stays black
  assert.strictEqual(h.darkenHex('#ffffff', 0.18), '#d1d1d1');
});

test('contrastForeground picks light text on dark colors, dark text on light colors', () => {
  assert.strictEqual(h.contrastForeground('#1a5276'), '#f4f1ea'); // dark navy -> light text
  assert.strictEqual(h.contrastForeground('#c8952a'), '#1f2d27'); // mid gold -> dark text
  assert.strictEqual(h.contrastForeground('#ffffff'), '#1f2d27'); // white -> dark text
  assert.strictEqual(h.contrastForeground('#000000'), '#f4f1ea'); // black -> light text
});

test('hexToRgba converts hex + alpha to an rgba() string', () => {
  assert.strictEqual(h.hexToRgba('#c8952a', 0.12), 'rgba(200,149,42,0.12)');
  assert.strictEqual(h.hexToRgba('#000000', 1), 'rgba(0,0,0,1)');
});

test('isValidHexColor accepts 3- and 6-digit hex, rejects everything else', () => {
  assert.strictEqual(h.isValidHexColor('#c8952a'), true);
  assert.strictEqual(h.isValidHexColor('#ABC'), true);
  assert.strictEqual(h.isValidHexColor('c8952a'), false);   // missing #
  assert.strictEqual(h.isValidHexColor('#gggggg'), false);  // non-hex chars
  assert.strictEqual(h.isValidHexColor('#12345'), false);   // wrong length
  assert.strictEqual(h.isValidHexColor(''), false);
  assert.strictEqual(h.isValidHexColor(null), false);
  assert.strictEqual(h.isValidHexColor(undefined), false);
});

test('findFamilyByDepth and groupIntoFamilyUnits', async () => {
  const persons = [
    { id: 'gpa', display_name: 'Grandpa', birth_surname: 'Smith', father: '', mother: '' },
    { id: 'gma', display_name: 'Grandma', birth_surname: 'Smith', father: '', mother: '' },
    { id: 'dad', display_name: 'Dad', birth_surname: 'Smith', father: 'gpa', mother: 'gma' },
    { id: 'mom', display_name: 'Mom', birth_surname: 'Jones', father: '', mother: '' },
    { id: 'kid1', display_name: 'Kid 1', birth_surname: 'Smith', father: 'dad', mother: 'mom' },
    { id: 'kid2', display_name: 'Kid 2', birth_surname: 'Smith', father: 'dad', mother: 'mom' }
  ];
  const couples = [
    { id: 'c1', partner_a: 'dad', partner_b: 'mom', status: 'married' }
  ];

  test('depth=1 from kid1 returns parents and siblings', () => {
    const result = h.findFamilyByDepth('kid1', 1, persons, couples);
    assert.ok(result.personIds instanceof Set);
    const ids = Array.from(result.personIds).sort();
    assert.deepStrictEqual(ids, ['dad', 'kid1', 'kid2', 'mom']);
  });

  test('depth=2 from kid1 returns grandparents too', () => {
    const result = h.findFamilyByDepth('kid1', 2, persons, couples);
    const ids = Array.from(result.personIds).sort();
    assert.deepStrictEqual(ids, ['dad', 'gma', 'gpa', 'kid1', 'kid2', 'mom']);
  });

  test('intermarriage case: same descendant via multiple ancestor paths', () => {
    const interpersons = [
      { id: 'gpa', display_name: 'Grandpa A', birth_surname: 'A', father: '', mother: '' },
      { id: 'gma', display_name: 'Grandma A', birth_surname: 'A', father: '', mother: '' },
      { id: 'pa1', display_name: 'Parent A', birth_surname: 'A', father: 'gpa', mother: 'gma' },
      { id: 'pa2', display_name: 'Parent B', birth_surname: 'A', father: 'gpa', mother: 'gma' },
      { id: 'child', display_name: 'Child', birth_surname: 'A', father: 'pa1', mother: 'pa2' }
    ];
    const intercouples = [];
    const result = h.findFamilyByDepth('child', 1, interpersons, intercouples);
    const ids = Array.from(result.personIds);
    assert.ok(ids.includes('pa1'));
    assert.ok(ids.includes('pa2'));
    assert.ok(ids.includes('child'));
    assert.strictEqual(ids.length, 3);
  });

  test('degradation when tree does not go back far enough', () => {
    const shallowPersons = [
      { id: 'parent', display_name: 'Parent', birth_surname: 'X', father: '', mother: '' },
      { id: 'child', display_name: 'Child', birth_surname: 'X', father: 'parent', mother: '' }
    ];
    const shallowCouples = [];
    const result = h.findFamilyByDepth('child', 2, shallowPersons, shallowCouples);
    const ids = Array.from(result.personIds).sort();
    assert.deepStrictEqual(ids, ['child', 'parent']);
  });

  test('spouse included but their separate family line is NOT pulled in', () => {
    const spousePersons = [
      { id: 'me', display_name: 'Me', birth_surname: 'Myer', father: '', mother: '' },
      { id: 'spouse', display_name: 'Spouse', birth_surname: 'Spousey', father: '', mother: '' },
      { id: 'spouse_parent', display_name: "Spouse's Parent", birth_surname: 'Spousey', father: '', mother: '' }
    ];
    const spouseCouples = [
      { id: 'c1', partner_a: 'me', partner_b: 'spouse', status: 'married' }
    ];
    const result = h.findFamilyByDepth('me', 1, spousePersons, spouseCouples);
    const ids = Array.from(result.personIds).sort();
    assert.deepStrictEqual(ids, ['me', 'spouse']);
  });

  test('asymmetric degradation: a half-sibling reachable only via a degraded branch is still found', () => {
    // dad's line goes back 2 full generations (gpa/gma); mom has no recorded parents at
    // all, so her branch degrades at level 1 — she must still anchor her OWN down-walk
    // (regression test for a bug where topmostAncestors got overwritten each level
    // instead of accumulating per-branch, silently dropping degraded branches' own
    // lateral relatives — e.g. this exact half-sibling, reachable only via mom).
    const persons = [
      { id: 'gpa', father: '', mother: '' },
      { id: 'gma', father: '', mother: '' },
      { id: 'dad', father: 'gpa', mother: 'gma' },
      { id: 'mom', father: '', mother: '' },
      { id: 'other_dad', father: '', mother: '' },
      { id: 'kid1', father: 'dad', mother: 'mom' },
      { id: 'kid2', father: 'dad', mother: 'mom' },
      { id: 'kid3', father: 'other_dad', mother: 'mom' }
    ];
    const couples = [
      { id: 'c1', partner_a: 'dad', partner_b: 'mom', status: 'married' },
      { id: 'c2', partner_a: 'other_dad', partner_b: 'mom', status: 'divorced' }
    ];
    const result = h.findFamilyByDepth('kid1', 2, persons, couples);
    assert.ok(result.personIds.has('kid3'), 'half-sibling via degraded mom-branch must be included');
    const ids = Array.from(result.personIds).sort();
    assert.deepStrictEqual(ids, ['dad', 'gma', 'gpa', 'kid1', 'kid2', 'kid3', 'mom']);
  });

  test('groupIntoFamilyUnits: a single unpartnered parent plus children groups into ONE unit', () => {
    // Regression test for a bug where the children-lookup loop iterated
    // unitPersonIds.slice(0, -1) — for a lone parent with no spouse in the set,
    // unitPersonIds was just [parentId], and slicing off the "last" element left an
    // empty array, skipping the children lookup entirely and splitting what should be
    // one family unit into one separate unit per person.
    const persons = [
      { id: 'single_parent', birth_surname: 'Lee', father: '', mother: '' },
      { id: 'kidA', father: 'single_parent', mother: '', birth_surname: 'Lee' },
      { id: 'kidB', father: 'single_parent', mother: '', birth_surname: 'Lee' }
    ];
    const units = h.groupIntoFamilyUnits(['single_parent', 'kidA', 'kidB'], persons, []);
    assert.strictEqual(units.length, 1);
    assert.deepStrictEqual(units[0].personIds.sort(), ['kidA', 'kidB', 'single_parent']);
  });

  test('groupIntoFamilyUnits fully accountless nuclear family', () => {
    const persons = [
      { id: 'dad', display_name: 'Dad', birth_surname: 'Smith', father: '', mother: '' },
      { id: 'mom', display_name: 'Mom', birth_surname: 'Jones', father: '', mother: '' },
      { id: 'kid1', display_name: 'Kid 1', birth_surname: 'Smith', father: 'dad', mother: 'mom' },
      { id: 'kid2', display_name: 'Kid 2', birth_surname: 'Smith', father: 'dad', mother: 'mom' }
    ];
    const couples = [{ id: 'c1', partner_a: 'dad', partner_b: 'mom', status: 'married' }];
    const personIds = new Set(['dad', 'mom', 'kid1', 'kid2']);
    const units = h.groupIntoFamilyUnits(Array.from(personIds), persons, couples);
    assert.strictEqual(units.length, 1);
    const unit = units[0];
    assert.deepStrictEqual(unit.personIds.sort(), ['dad', 'kid1', 'kid2', 'mom']);
    assert.strictEqual(unit.hasAnyAccount, false);
    assert.deepStrictEqual(unit.accountHolderIds.sort(), []);
    assert.deepStrictEqual(unit.accountlessIds.sort(), ['dad', 'kid1', 'kid2', 'mom']);
    assert.ok(unit.surnameLabel === 'Smith' || unit.surnameLabel === 'Jones');
  });

  test('groupIntoFamilyUnits mixed account status', () => {
    const persons = [
      { id: 'dad', display_name: 'Dad', birth_surname: 'Smith', father: '', mother: '', linked_user: 'u1' },
      { id: 'mom', display_name: 'Mom', birth_surname: 'Jones', father: '', mother: '' },
      { id: 'kid1', display_name: 'Kid 1', birth_surname: 'Smith', father: 'dad', mother: 'mom' }
    ];
    const couples = [{ id: 'c1', partner_a: 'dad', partner_b: 'mom', status: 'married' }];
    const personIds = new Set(['dad', 'mom', 'kid1']);
    const units = h.groupIntoFamilyUnits(Array.from(personIds), persons, couples);
    assert.strictEqual(units.length, 1);
    const unit = units[0];
    assert.deepStrictEqual(unit.personIds.sort(), ['dad', 'kid1', 'mom']);
    assert.strictEqual(unit.hasAnyAccount, true);
    assert.deepStrictEqual(unit.accountHolderIds, ['dad']);
    assert.deepStrictEqual(unit.accountlessIds.sort(), ['kid1', 'mom']);
  });

  await test('groupIntoFamilyUnits lone individual with no partner/children', () => {
    const persons = [
      { id: 'aunt', display_name: 'Aunt', birth_surname: 'Smith', father: '', mother: '' }
    ];
    const couples = [];
    const personIds = new Set(['aunt']);
    const units = h.groupIntoFamilyUnits(Array.from(personIds), persons, couples);
    assert.strictEqual(units.length, 1);
    const unit = units[0];
    assert.deepStrictEqual(unit.personIds, ['aunt']);
    assert.strictEqual(unit.hasAnyAccount, false);
    assert.deepStrictEqual(unit.accountHolderIds, []);
    assert.deepStrictEqual(unit.accountlessIds, ['aunt']);
  });

  await test('groupIntoFamilyUnits: an adult child with their own spouse/children forms a separate unit', () => {
    // Regression test (Codex review): findFamilyByDepth's insertion order puts ancestors
    // first, so a grandparent is commonly processed before their adult child. Without a
    // check for "does this child already head their own nuclear family," the grandparent
    // absorbed the child into ITS unit, leaving the child's own spouse/kids stranded in
    // an incomplete separate grouping instead of together with the child.
    const persons = [
      { id: 'grandparent', birth_surname: 'Old', father: '', mother: '' },
      { id: 'adult_child', father: 'grandparent', mother: '', birth_surname: 'Old' },
      { id: 'childs_spouse', birth_surname: 'New', father: '', mother: '' },
      { id: 'grandchild', father: 'adult_child', mother: 'childs_spouse', birth_surname: 'Old' }
    ];
    const couples = [{ id: 'c1', partner_a: 'adult_child', partner_b: 'childs_spouse', status: 'married' }];
    const ids = ['grandparent', 'adult_child', 'childs_spouse', 'grandchild'];
    const units = h.groupIntoFamilyUnits(ids, persons, couples);
    assert.strictEqual(units.length, 2);
    const sorted = units.map(u => u.personIds.slice().sort());
    assert.ok(sorted.some(u => u.length === 1 && u[0] === 'grandparent'));
    assert.ok(sorted.some(u => u.length === 3 && u.join(',') === ['adult_child', 'childs_spouse', 'grandchild'].sort().join(',')));
  });

  await test('groupIntoFamilyUnits: divorced ex-partners are NOT grouped as one household', () => {
    const persons = [
      { id: 'exA', birth_surname: 'Alpha', father: '', mother: '' },
      { id: 'exB', birth_surname: 'Beta', father: '', mother: '' }
    ];
    const couples = [{ id: 'c1', partner_a: 'exA', partner_b: 'exB', status: 'divorced' }];
    const units = h.groupIntoFamilyUnits(['exA', 'exB'], persons, couples);
    assert.strictEqual(units.length, 2);
  });

  await test('groupIntoFamilyUnits: family label comes from the parent, not a majority vote over children', () => {
    const persons = [
      { id: 'parent', birth_surname: 'Jones', father: '', mother: '' },
      { id: 'kid1', father: 'parent', mother: '', birth_surname: 'Smith' },
      { id: 'kid2', father: 'parent', mother: '', birth_surname: 'Smith' }
    ];
    const units = h.groupIntoFamilyUnits(['parent', 'kid1', 'kid2'], persons, []);
    assert.strictEqual(units.length, 1);
    assert.strictEqual(units[0].surnameLabel, 'Jones');
  });
});
