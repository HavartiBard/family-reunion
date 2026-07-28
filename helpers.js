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
    const style = withTime
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
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
    esc, userInitials, personInitials, personYears, avatarTint, daysUntil, fmtEventDate,
    filterPeople, filterNews, groupNotifications, defaultPrivacy, defaultNotifPrefs,
    darkenHex, contrastForeground, hexToRgba, isValidHexColor,
    AVATAR_TINTS
  };
});
