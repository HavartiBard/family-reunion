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

  function initialsFrom(str) {
    return (str || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  }
  function userInitials(u) { return initialsFrom((u && (u.name || u.email)) || ''); }
  function personInitials(p) { return initialsFrom((p && p.display_name) || ''); }

  function personYears(p) {
    const b = (p.birth_date || '').slice(0, 4);
    const d = (p.death_date || '').slice(0, 4);
    if (!b && !d) return '';
    return `${b || '?'}–${d || (p.living === false ? '?' : '')}`.replace(/–$/, '');
  }

  function avatarTint(index) {
    const i = ((index % AVATAR_TINTS.length) + AVATAR_TINTS.length) % AVATAR_TINTS.length;
    return AVATAR_TINTS[i];
  }

  function daysUntil(dateStr, now) {
    const target = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = Math.floor((target - base) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function _hay(p) {
    return [p.display_name, p.given_name, p.family_name, p.bio, (p.birth_date || '').slice(0, 4)]
      .filter(Boolean).join(' ').toLowerCase();
  }
  function filterPeople(people, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return people.slice();
    return people.filter(p => _hay(p).includes(q));
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
    esc, userInitials, personInitials, personYears, avatarTint, daysUntil,
    filterPeople, filterNews, groupNotifications, defaultPrivacy, defaultNotifPrefs,
    AVATAR_TINTS
  };
});
