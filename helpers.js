// helpers.js — pure, side-effect-free helpers. No DOM, no network.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api); // attach each helper as a window global
})(typeof self !== 'undefined' ? self : this, function () {

  const AVATAR_TINTS = ['#e7d9bd', '#d8e0d2', '#e8dcd2', '#dfe2e6', '#ece0cf', '#dde4dd'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // esc() alone is not safe inside a quoted HTML attribute (e.g. value="${...}") — it
  // doesn't escape quote characters, so a value containing a double quote can break out
  // of the attribute and inject arbitrary markup/attributes. Use this wherever untrusted
  // text is interpolated directly into an attribute value string.
  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initialsFrom(str) {
    return (str || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  }
  function userInitials(u) { return initialsFrom((u && (u.name || u.email)) || ''); }
  function personInitials(p) { return initialsFrom((p && p.display_name) || ''); }

  function _extractYear(s) {
    const m = (s || '').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
    return m ? m[1] : '';
  }

  function personYears(p) {
    const b = _extractYear(p.birth_date);
    const d = _extractYear(p.death_date);
    if (!b && !d) return '';
    if (d) return `${b || '?'}–${d}`;
    if (b) {
      const age = new Date().getFullYear() - parseInt(b);
      return (p.living !== false && (p.living === true || age < 80)) ? `${b}–Living` : b;
    }
    return '';
  }

  function avatarTint(index) {
    const i = ((index % AVATAR_TINTS.length) + AVATAR_TINTS.length) % AVATAR_TINTS.length;
    return AVATAR_TINTS[i];
  }

  function _hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  function _toHex2(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }

  function darkenHex(hex, amount) {
    const { r, g, b } = _hexToRgb(hex);
    const f = 1 - amount;
    return `#${_toHex2(r * f)}${_toHex2(g * f)}${_toHex2(b * f)}`;
  }

  function contrastForeground(hex) {
    const { r, g, b } = _hexToRgb(hex);
    // WCAG-style relative luminance (sRGB, no gamma correction needed at this precision).
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55 ? '#1f2d27' : '#f4f1ea';
  }

  function hexToRgba(hex, alpha) {
    const { r, g, b } = _hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function isValidHexColor(hex) {
    return typeof hex === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
  }

  function daysUntil(dateStr, now) {
    const target = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = Math.floor((target - base) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function fmtEventDate(iso, opts) {
    if (!iso) return '';
    const withTime = opts && opts.withTime;
    const allDay = opts && opts.allDay;
    const style = (withTime && !allDay)
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { weekday: withTime ? 'long' : 'short', month: withTime ? 'long' : 'short', day: 'numeric', year: 'numeric' };
    if (allDay) style.timeZone = 'UTC';
    return new Date(iso).toLocaleDateString('en-US', style);
  }

  function _hay(p) {
    return [p.display_name, p.given_name, p.family_name, p.bio, _extractYear(p.birth_date)]
      .filter(Boolean).join(' ').toLowerCase();
  }
  function filterPeople(people, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return people.slice();
    return people.filter(p => _hay(p).includes(q));
  }

  function findFamilyByDepth(rootPersonId, depth, persons, couples) {
    const personMap = new Map();
    for (const p of persons) personMap.set(p.id, p);

    const ancestorSet = new Set();
    // topmostAncestors must accumulate per-branch, not get overwritten each level — if one
    // branch (e.g. father's line) reaches the full requested depth while another (e.g.
    // mother's, no recorded parents) dead-ends earlier, BOTH the depth-N ancestor(s) on the
    // full branch AND the dead-end person on the degraded branch are "topmost" for their
    // own line and must each anchor their own down-walk below. Overwriting with only the
    // last-computed level (as an earlier draft did) silently drops the degraded branch's
    // own lateral relatives (e.g. half-siblings reachable only via that dead-ended parent)
    // — confirmed empirically with a fixture where a half-sibling via a parent-with-no-
    // recorded-ancestors was missing from the result.
    const topmostAncestors = new Set();

    if (depth <= 0) {
      topmostAncestors.add(rootPersonId);
    } else {
      let currentLevel = [rootPersonId];
      for (let level = 1; level <= depth; level++) {
        const nextLevel = [];
        for (const pid of currentLevel) {
          const person = personMap.get(pid);
          const father = person && person.father;
          const mother = person && person.mother;
          if (!father && !mother) {
            topmostAncestors.add(pid); // this branch dead-ends here
            continue;
          }
          if (father) nextLevel.push(father);
          if (mother) nextLevel.push(mother);
        }
        for (const pid of nextLevel) ancestorSet.add(pid);
        if (level === depth) {
          for (const pid of nextLevel) topmostAncestors.add(pid); // reached full depth
        }
        currentLevel = nextLevel;
        if (currentLevel.length === 0) break;
      }
    }

    const lateralSet = new Set();
    let lateralCurrent = Array.from(topmostAncestors);
    for (let level = 1; level <= depth && lateralCurrent.length > 0; level++) {
      const nextLevel = [];
      for (const pid of lateralCurrent) {
        for (const p of persons) {
          if ((p.father === pid || p.mother === pid) && !lateralSet.has(p.id)) {
            lateralSet.add(p.id);
            nextLevel.push(p.id);
          }
        }
      }
      lateralCurrent = nextLevel;
    }

    const descendantSet = new Set();
    let descCurrent = [rootPersonId];
    for (let level = 1; level <= depth && descCurrent.length > 0; level++) {
      const nextLevel = [];
      for (const pid of descCurrent) {
        for (const p of persons) {
          if ((p.father === pid || p.mother === pid) && !descendantSet.has(p.id)) {
            descendantSet.add(p.id);
            nextLevel.push(p.id);
          }
        }
      }
      descCurrent = nextLevel;
    }

    const union = new Set();
    for (const id of ancestorSet) union.add(id);
    for (const id of lateralSet) union.add(id);
    for (const id of descendantSet) union.add(id);
    union.add(rootPersonId);

    const coupleMap = new Map();
    for (const c of couples) {
      if (c.status === 'divorced') continue;
      if (!coupleMap.has(c.partner_a)) coupleMap.set(c.partner_a, []);
      if (!coupleMap.has(c.partner_b)) coupleMap.set(c.partner_b, []);
      coupleMap.get(c.partner_a).push(c.partner_b);
      coupleMap.get(c.partner_b).push(c.partner_a);
    }

    const withSpouses = new Set(union);
    for (const pid of union) {
      const spouses = coupleMap.get(pid) || [];
      for (const spouseId of spouses) withSpouses.add(spouseId);
    }

    return { personIds: withSpouses };
  }

  function groupIntoFamilyUnits(personIds, persons, couples) {
    const personSet = new Set(personIds);
    const personMap = new Map();
    for (const p of persons) personMap.set(p.id, p);

    const coupleMap = new Map();
    for (const c of couples) {
      // Must match findFamilyByDepth's own divorced-couple exclusion — without it, two
      // independently-present ex-partners (e.g. the root's divorced parents) would be
      // grouped as one household and offered a single shared email invite.
      if (c.status === 'divorced') continue;
      if (!personSet.has(c.partner_a) || !personSet.has(c.partner_b)) continue;
      if (!coupleMap.has(c.partner_a)) coupleMap.set(c.partner_a, []);
      if (!coupleMap.has(c.partner_b)) coupleMap.set(c.partner_b, []);
      coupleMap.get(c.partner_a).push(c.partner_b);
      coupleMap.get(c.partner_b).push(c.partner_a);
    }

    const childMap = new Map();
    for (const p of persons) {
      if (!personSet.has(p.id)) continue;
      if (p.father && personSet.has(p.father)) {
        if (!childMap.has(p.father)) childMap.set(p.father, new Set());
        childMap.get(p.father).add(p.id);
      }
      if (p.mother && personSet.has(p.mother)) {
        if (!childMap.has(p.mother)) childMap.set(p.mother, new Set());
        childMap.get(p.mother).add(p.id);
      }
    }

    const units = [];
    const assigned = new Set();

    for (const pid of personIds) {
      if (assigned.has(pid)) continue;
      const unitPersonIds = [pid];
      assigned.add(pid);

      const spouses = coupleMap.get(pid) || [];
      for (const spouseId of spouses) {
        if (!assigned.has(spouseId)) {
          unitPersonIds.push(spouseId);
          assigned.add(spouseId);
        }
      }

      // Snapshot the parent(s) (pid + any spouse just added) BEFORE appending children —
      // an earlier draft iterated `unitPersonIds.slice(0, -1)` here, which for a single
      // unpartnered parent (unitPersonIds === [pid], nothing else added yet) sliced down
      // to an empty array and skipped the children lookup entirely, silently splitting a
      // single-parent-plus-children unit into one separate unit per person instead of one
      // combined unit — confirmed empirically (a single parent + 2 kids produced 3 units,
      // not 1). Iterate a full snapshot of the parent set instead.
      const parentIds = unitPersonIds.slice();
      for (const memberId of parentIds) {
        const children = childMap.get(memberId) || [];
        for (const childId of children) {
          if (assigned.has(childId)) continue;
          // Only absorb a child into THIS unit if they don't head their own nuclear
          // family — a child with a spouse or children of their own (also present in
          // the result set) belongs in a SEPARATE unit for that family, not folded into
          // their parent's. Without this check, a grandparent processed before their
          // adult child (which findFamilyByDepth's insertion order makes common —
          // ancestors are added first) would absorb that child here; the main loop
          // would then find the child already `assigned` and skip it entirely,
          // silently dropping the child's own spouse/kids instead of grouping them as
          // their own unit. Confirmed as a real, reachable bug via Codex review.
          const childHasOwnSpouse = (coupleMap.get(childId) || []).length > 0;
          const childHasOwnChildren = (childMap.get(childId) || new Set()).size > 0;
          if (childHasOwnSpouse || childHasOwnChildren) continue;
          unitPersonIds.push(childId);
          assigned.add(childId);
        }
      }

      const accountHolderIds = unitPersonIds.filter(id => personMap.get(id)?.linked_user);
      const accountlessIds = unitPersonIds.filter(id => !personMap.get(id)?.linked_user);

      // Derive the label from the PARENT(s) only, not a majority vote across every
      // member — a single parent (e.g. "Jones") whose kids happen to carry a different
      // surname (e.g. "Smith," from an ex-partner) must not have the unit mislabeled
      // "Smith Family" by outnumbering the one parent 2-to-1. The design's own spec
      // calls for the couple/parent's surname specifically.
      let surnameLabel = 'Family';
      const parentSurnames = parentIds
        .map(id => {
          const p = personMap.get(id);
          return (p && (p.birth_surname || p.family_name || '')) || '';
        })
        .filter(Boolean);
      if (parentSurnames.length > 0) {
        surnameLabel = parentSurnames[0];
      }

      const hasAnyAccount = accountHolderIds.length > 0;

      units.push({
        personIds: unitPersonIds,
        hasAnyAccount: hasAnyAccount,
        accountHolderIds: accountHolderIds,
        accountlessIds: accountlessIds,
        surnameLabel: surnameLabel
      });
    }

    return units;
  }
  function filterNews(news, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return news.slice();
    return news.filter(n => `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q));
  }

  function groupNotifications(notes, now) {
    const today = [], week = [], earlier = [];
    const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const weekAgo = startToday - 7 * 86400000;
    for (const n of notes) {
      const t = new Date(String(n.created).replace(' ', 'T')).getTime();
      if (t >= startToday) today.push(n);
      else if (t >= weekAgo) week.push(n);
      else earlier.push(n);
    }
    return { today, week, earlier };
  }

  function defaultPrivacy() { return { phone: 'family', address: 'admins', directory: 'family' }; }
  function defaultNotifPrefs() { return { birthdays: true, new_members: true, photos: true, reunion: true }; }

  return {
    esc, escAttr, userInitials, personInitials, personYears, avatarTint, daysUntil, fmtEventDate,
    filterPeople, filterNews, groupNotifications, defaultPrivacy, defaultNotifPrefs,
    darkenHex, contrastForeground, hexToRgba, isValidHexColor,
    findFamilyByDepth, groupIntoFamilyUnits,
    AVATAR_TINTS
  };
});
