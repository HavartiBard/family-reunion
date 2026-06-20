# Events System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Reunion screen with a generic Events system supporting typed events, per-event RSVPs, organizers, and a dynamic home hero.

**Architecture:** Two new PocketBase collections (`events`, `event_rsvps`) replace the `users.rsvp` field and hardcoded constants. `SCREENS.reunion` becomes `SCREENS.events` with list + detail views. Home hero fetches the next upcoming event dynamically.

**Tech Stack:** PocketBase JS migrations, raw HTML/CSS/JS, Node built-in test runner for helper tests.

## Global Constraints

- No build step — raw HTML/CSS/JS only; no npm, no bundler
- All user-supplied strings rendered in innerHTML must pass through `esc()`
- `apiFetch(path, opts)` always sends `Authorization: token` header (do not use `fetch` directly for authenticated calls)
- PocketBase access rule base: `@request.auth.id != "" && @request.auth.approved = true` (abbreviated `APPROVED`)
- CSS uses design tokens from `:root` — no hardcoded hex colors outside the token block
- Fonts: Newsreader (display/headings) + Schibsted Grotesk (UI/body)
- Family name throughout: "Kelsall" (never "Bender" or any prototype name)
- Working directory for all commands: `/home/james/projects/family-reunion`
- Tests run with: `node --test helpers.test.js` and `node --test merge.test.js`
- Commit after every task with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

### Task 1: Migrations — events + event_rsvps collections, remove users.rsvp

**Files:**
- Create: `backend/pb_migrations/1718500007_add_events.js`
- Create: `backend/pb_migrations/1718500008_remove_user_rsvp.js`

**Interfaces:**
- Produces: `events` collection (fields: name, type, description, start_date, end_date, location, cover_photo, organizers →users multi, created_by →users)
- Produces: `event_rsvps` collection (fields: event →events cascade-delete, user →users cascade-delete, status select going/maybe/no)
- Produces: `users.rsvp` field removed

- [ ] **Step 1: Write migration for events + event_rsvps**

Create `/home/james/projects/family-reunion/backend/pb_migrations/1718500007_add_events.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const APPROVED = '@request.auth.id != "" && @request.auth.approved = true';
  const IS_ORGANIZER = 'organizers ~ @request.auth.id';
  const IS_ADMIN = '@request.auth.family_admin = true';

  const events = new Collection({
    name: "events", type: "base",
    listRule: APPROVED, viewRule: APPROVED, createRule: APPROVED,
    updateRule: `${APPROVED} && (${IS_ORGANIZER} || ${IS_ADMIN})`,
    deleteRule: `${APPROVED} && (${IS_ORGANIZER} || ${IS_ADMIN})`,
    schema: [
      { name:"name",        type:"text",     required:true },
      { name:"type",        type:"select",   options:{ maxSelect:1, values:["reunion","birthday","wedding","holiday","other"] } },
      { name:"description", type:"text" },
      { name:"start_date",  type:"text",     required:true },
      { name:"end_date",    type:"text" },
      { name:"location",    type:"text" },
      { name:"cover_photo", type:"file",     options:{ maxSelect:1, maxSize:5242880, mimeTypes:["image/jpeg","image/png","image/webp","image/gif"] } },
      { name:"organizers",  type:"relation", options:{ collectionId:users.id, maxSelect:null, cascadeDelete:false } },
      { name:"created_by",  type:"relation", options:{ collectionId:users.id, maxSelect:1,    cascadeDelete:false } }
    ]
  });
  dao.saveCollection(events);

  const event_rsvps = new Collection({
    name: "event_rsvps", type: "base",
    listRule: APPROVED, viewRule: APPROVED,
    createRule: `@request.auth.id != "" && user = @request.auth.id`,
    updateRule: `@request.auth.id != "" && user = @request.auth.id`,
    deleteRule: `@request.auth.id != "" && user = @request.auth.id`,
    schema: [
      { name:"event",  type:"relation", required:true, options:{ collectionId:events.id,  maxSelect:1, cascadeDelete:true } },
      { name:"user",   type:"relation", required:true, options:{ collectionId:users.id,   maxSelect:1, cascadeDelete:true } },
      { name:"status", type:"select",   required:true, options:{ maxSelect:1, values:["going","maybe","no"] } }
    ]
  });
  dao.saveCollection(event_rsvps);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("event_rsvps"));
  dao.deleteCollection(dao.findCollectionByNameOrId("events"));
});
```

- [ ] **Step 2: Write migration to remove users.rsvp**

Create `/home/james/projects/family-reunion/backend/pb_migrations/1718500008_remove_user_rsvp.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.removeField("rsvp");
  dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.addField(new SchemaField({
    name: "rsvp", type: "select",
    options: { maxSelect: 1, values: ["going","maybe","no"] }
  }));
  dao.saveCollection(collection);
});
```

- [ ] **Step 3: Verify migration files exist**

```bash
ls backend/pb_migrations/1718500007_add_events.js backend/pb_migrations/1718500008_remove_user_rsvp.js
```

Expected: both files listed, no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/pb_migrations/1718500007_add_events.js backend/pb_migrations/1718500008_remove_user_rsvp.js
git commit -m "feat(events): migrations for events, event_rsvps, remove users.rsvp

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Events CSS

**Files:**
- Modify: `app.css` — replace `.venue-hero`, `.venue-bar`, `.rsvp-*`, `.sched-*` blocks with events styles; add new event card, detail, and type-icon styles

**Interfaces:**
- Produces: `.events-header`, `.event-card`, `.ec-thumb`, `.ec-meta`, `.ec-type`, `.ec-date`, `.event-detail-hero`, `.event-info-bar`, `.event-type-icon`, `.ev-rsvp-row`, `.ev-rsvp-opt` (reuses `.rsvp-opt` pattern with new name to avoid collision)

- [ ] **Step 1: Replace reunion CSS block in app.css**

Find the `/* ── Reunion ── */` section (around line 232) and replace it entirely:

```css
/* ── Events ─────────────────────────────────────────────────────────────── */
.events-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem}
.event-card{cursor:pointer;border-radius:14px;overflow:hidden;border:1px solid var(--border-default);
  background:var(--bg-card);transition:box-shadow .15s;display:flex;flex-direction:column}
.event-card:hover{box-shadow:var(--shadow-hover)}
.events-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;margin-bottom:2rem}
.ec-thumb{height:140px;overflow:hidden;background:var(--bg-hover);position:relative;flex-shrink:0}
.ec-thumb img{width:100%;height:100%;object-fit:cover}
.ec-type-badge{position:absolute;top:10px;left:10px;background:rgba(31,45,39,.72);color:#f4f1ea;
  font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:.25rem .55rem;border-radius:20px}
.ec-meta{padding:.85rem 1rem 1rem}
.ec-name{font-family:var(--font-display);font-size:1.1rem;font-weight:500;margin-bottom:.2rem}
.ec-date{font-size:.82rem;color:var(--text-secondary);margin-bottom:.15rem}
.ec-loc{font-size:.8rem;color:var(--text-muted)}
.ec-rsvp-badge{display:inline-flex;align-items:center;gap:.3rem;margin-top:.5rem;
  font-size:.76rem;font-weight:600;color:var(--accent-gold)}
.event-detail-hero{height:260px;border-radius:16px;overflow:hidden;position:relative;margin-bottom:-.5rem}
.event-detail-hero img{width:100%;height:100%;object-fit:cover}
.event-detail-hero-placeholder{width:100%;height:100%;
  background:repeating-linear-gradient(45deg,#e7ddcb 0 14px,#ddd1ba 14px 28px);
  display:flex;align-items:center;justify-content:center;font-size:3rem}
.event-info-bar{display:flex;gap:28px;flex-wrap:wrap;margin-top:-20px;position:relative;z-index:1;
  margin-left:18px;margin-right:18px;background:var(--bg-card);border-radius:12px;
  padding:1rem 1.25rem;border:1px solid var(--border-default)}
.eib-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted)}
.eib-val{font-size:.95rem;font-weight:600;margin-top:2px}
.ev-rsvp-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.ev-rsvp-opt{height:54px;border-radius:12px;border:2px solid var(--border-input);
  background:var(--bg-subtle);color:var(--text-primary);font-weight:600;cursor:pointer;
  font-family:inherit;font-size:.95rem;transition:all .12s}
.ev-rsvp-opt:hover{border-color:var(--accent-gold)}
.ev-rsvp-opt.active{background:var(--bg-sidebar);color:var(--text-sidebar-active);border-color:var(--bg-sidebar)}
.events-section-label{font-family:var(--font-ui);font-size:.72rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.1em;color:var(--text-muted);margin:1.5rem 0 .75rem}
.events-empty{text-align:center;padding:3rem 0;color:var(--text-muted)}
@media (max-width:767px){.ev-rsvp-row{grid-template-columns:1fr}.event-info-bar{margin-top:12px;gap:16px}}
```

- [ ] **Step 2: Run tests to confirm no CSS syntax breaks JS tests**

```bash
node --test helpers.test.js
```

Expected: `# pass 10`, `# fail 0`

- [ ] **Step 3: Commit**

```bash
git add app.css
git commit -m "feat(events): events CSS — cards, detail hero, RSVP buttons, grid

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Events screen JS — list view + detail view + RSVP

**Files:**
- Modify: `app.js`
  - Remove `REUNION_DATE` constant (line 9)
  - Replace NAV entry `reunion` → `events` (line 20)
  - Replace `REUNION_SCHEDULE` + `SCREENS.reunion` + `setRsvp` block (~lines 848–899) with new events code

**Interfaces:**
- Produces: `SCREENS.events(params)` — renders list when no `params.event`; renders detail when `params.event` is set
- Produces: `setEventRsvp(eventId, status)` — PATCHes or POSTs to `event_rsvps`
- Produces: `openEventForm(eventId?)` — create/edit modal
- Consumes: `fileUrl(collection, rec, field)` (already exists in app.js)
- Consumes: `esc()`, `apiFetch()`, `mountMain()`, `navigate()`, `toast()`, `openModal()`, `closeModal()`, `formErr()`, `val()`, `el()` (all already exist)

- [ ] **Step 1: Remove REUNION_DATE and update NAV**

In `app.js`, make these targeted changes:

Remove line 9:
```js
// DELETE THIS LINE:
const REUNION_DATE = '2026-08-15';
```

Change line 20 (NAV entry):
```js
// BEFORE:
  { tab:'reunion',       label:'Reunion',        ico:'◆' },
// AFTER:
  { tab:'events',        label:'Events',         ico:'◆' },
```

- [ ] **Step 2: Replace the entire reunion block**

Find the comment `// ── Reunion RSVP` and replace everything from there through the closing `}` of `setRsvp` (inclusive) with:

```js
// ── Events ───────────────────────────────────────────────────────────────────
const EVENT_TYPE_ICONS = { reunion:'🏕', birthday:'🎂', wedding:'💍', holiday:'🎉', other:'📅' };

SCREENS.events = async function(params){
  if (params && params.event) { await renderEventDetail(params.event); return; }
  await renderEventsList();
};

async function renderEventsList(){
  mountMain('<div class="screen-pad" style="max-width:1100px"><div class="spinner"></div></div>');
  let events = [];
  try {
    const res = await apiFetch('/api/collections/events/records?sort=start_date&perPage=200');
    if (res.ok) events = (await res.json()).items || [];
  } catch { /* ignore */ }

  const now = new Date();
  const upcoming = events.filter(e => e.start_date && new Date(e.start_date) >= now);
  const past     = events.filter(e => e.start_date && new Date(e.start_date) <  now);

  function fmtDate(iso){
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  }

  function eventCard(e){
    const thumb = fileUrl('events', e, 'cover_photo');
    const icon  = EVENT_TYPE_ICONS[e.type] || '📅';
    return `<div class="event-card" onclick="navigate('events',{event:'${e.id}'})">
      <div class="ec-thumb">
        ${thumb ? `<img src="${esc(thumb)}" alt="">` : `<div style="width:100%;height:100%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:2.5rem">${icon}</div>`}
        <div class="ec-type-badge">${esc(e.type || 'event')}</div>
      </div>
      <div class="ec-meta">
        <div class="ec-name">${esc(e.name)}</div>
        <div class="ec-date">${esc(fmtDate(e.start_date))}</div>
        ${e.location ? `<div class="ec-loc">📍 ${esc(e.location)}</div>` : ''}
      </div>
    </div>`;
  }

  mountMain(`<div class="screen-pad" style="max-width:1100px">
    <div class="events-header">
      <h1 class="card-title" style="margin:0">Events</h1>
      <button class="btn btn-primary btn-sm" onclick="openEventForm()">+ Add event</button>
    </div>
    ${upcoming.length
      ? `<div class="events-section-label">Upcoming</div><div class="events-grid">${upcoming.map(eventCard).join('')}</div>`
      : '<div class="events-empty"><p>No upcoming events yet.</p></div>'}
    ${past.length ? `
      <details>
        <summary class="events-section-label" style="cursor:pointer;list-style:none">Past events (${past.length})</summary>
        <div class="events-grid" style="margin-top:.75rem">${past.map(eventCard).join('')}</div>
      </details>` : ''}
  </div>`);
}

async function renderEventDetail(eventId){
  mountMain('<div class="screen-pad" style="max-width:860px"><div class="spinner"></div></div>');
  let event = null, myRsvp = null, goingCount = 0, maybeCount = 0;
  try {
    const [eRes, rRes, cRes] = await Promise.all([
      apiFetch(`/api/collections/events/records/${eventId}?expand=organizers`),
      apiFetch(`/api/collections/event_rsvps/records?filter=${encodeURIComponent(`(event="${eventId}" && user="${userId}")`)}` + `&perPage=1`),
      apiFetch(`/api/collections/event_rsvps/records?filter=${encodeURIComponent(`(event="${eventId}")`)}` + `&perPage=200`)
    ]);
    if (eRes.ok) event = await eRes.json();
    if (rRes.ok) { const d = await rRes.json(); myRsvp = d.items && d.items[0]; }
    if (cRes.ok) {
      const items = (await cRes.json()).items || [];
      goingCount = items.filter(r => r.status === 'going').length;
      maybeCount = items.filter(r => r.status === 'maybe').length;
    }
  } catch { /* ignore */ }
  if (!event) { mountMain('<div class="screen-pad"><div class="empty-state"><p>Event not found.</p></div></div>'); return; }

  const thumb = fileUrl('events', event, 'cover_photo');
  const icon  = EVENT_TYPE_ICONS[event.type] || '📅';
  const organizers = (event.expand && event.expand.organizers) || [];
  const isOrganizer = organizers.some(o => o.id === userId) || (currentUser && currentUser.family_admin);

  function fmtDate(iso){ return iso ? new Date(iso).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : ''; }

  const curStatus = myRsvp ? myRsvp.status : '';
  const rsvpOpt = (key, label) => `<button class="ev-rsvp-opt${curStatus === key ? ' active' : ''}" onclick="setEventRsvp('${eventId}','${key}')">${label}</button>`;

  mountMain(`<div class="screen-pad" style="max-width:860px">
    <div class="breadcrumb"><span class="link" onclick="navigate('events')">Events</span> › ${esc(event.name)}</div>
    <div class="event-detail-hero" style="margin-top:.75rem">
      ${thumb ? `<img src="${esc(thumb)}" alt="">` : `<div class="event-detail-hero-placeholder">${icon}</div>`}
    </div>
    <div class="event-info-bar">
      <div><div class="eib-label">When</div><div class="eib-val">${esc(fmtDate(event.start_date))}</div></div>
      ${event.location ? `<div><div class="eib-label">Where</div><div class="eib-val">${esc(event.location)}</div></div>` : ''}
      <div><div class="eib-label">Headcount</div><div class="eib-val">${goingCount} going · ${maybeCount} maybe</div></div>
    </div>
    <div style="margin-top:1.5rem;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div>
        <h1 style="font-family:var(--font-display);font-size:2rem;font-weight:500">${esc(event.name)}</h1>
        <span class="pill" style="margin-top:.35rem">${esc(event.type || 'event')}</span>
        ${organizers.length ? `<div style="font-size:.82rem;color:var(--text-muted);margin-top:.4rem">Organised by ${organizers.map(o => esc(o.name || o.email)).join(', ')}</div>` : ''}
      </div>
      ${isOrganizer ? `<button class="btn btn-outline btn-sm" onclick="openEventForm('${event.id}')">Edit event</button>` : ''}
    </div>
    ${event.description ? `<div class="card" style="margin-top:1.25rem"><p style="line-height:1.6">${esc(event.description)}</p></div>` : ''}
    <div class="card" style="margin-top:1.25rem">
      <div class="section-label" style="margin-bottom:1rem">Will you be there?</div>
      <div class="ev-rsvp-row">
        ${rsvpOpt('going', "I'm going")}${rsvpOpt('maybe', 'Maybe')}${rsvpOpt('no', "Can't make it")}
      </div>
    </div>
  </div>`);
}

async function setEventRsvp(eventId, status){
  try {
    const chkRes = await apiFetch(`/api/collections/event_rsvps/records?filter=${encodeURIComponent(`(event="${eventId}" && user="${userId}")`)}` + `&perPage=1`);
    const existing = chkRes.ok ? ((await chkRes.json()).items || [])[0] : null;
    let res;
    if (existing) {
      res = await apiFetch(`/api/collections/event_rsvps/records/${existing.id}`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ status }) });
    } else {
      res = await apiFetch('/api/collections/event_rsvps/records', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ event: eventId, user: userId, status }) });
    }
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Could not save RSVP'); }
    toast('RSVP saved.', 'success');
    await renderEventDetail(eventId);
  } catch (e) { toast(e.message, 'error'); }
}

function openEventForm(eventId){
  const isEdit = !!eventId;
  // Pre-populate fields for edit after a short delay to allow modal to render
  openModal(`<h2 class="card-title">${isEdit ? 'Edit event' : 'New event'}</h2>
    <div id="evf-error" class="alert alert-error" style="display:none"></div>
    <div class="form-group"><label>Name</label><input id="evf-name" /></div>
    <div class="row-2">
      <div class="form-group"><label>Type</label>
        <select id="evf-type">
          ${['reunion','birthday','wedding','holiday','other'].map(t =>
            `<option value="${t}">${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Location</label><input id="evf-loc" /></div>
    </div>
    <div class="row-2">
      <div class="form-group"><label>Start date/time</label><input id="evf-start" type="datetime-local" /></div>
      <div class="form-group"><label>End date/time</label><input id="evf-end" type="datetime-local" /></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="evf-desc"></textarea></div>
    <div class="form-group"><label>Cover photo</label><input id="evf-photo" type="file" accept="image/*" /></div>
    <div style="display:flex;gap:.6rem;margin-top:.75rem">
      <button class="btn btn-primary" onclick="saveEvent('${eventId || ''}')">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      ${isEdit ? `<button class="btn btn-danger" style="margin-left:auto" onclick="deleteEvent('${eventId}')">Delete</button>` : ''}
    </div>`);
  if (isEdit) {
    apiFetch(`/api/collections/events/records/${eventId}`).then(async r => {
      if (!r.ok) return;
      const e = await r.json();
      const n = el('evf-name'); if (n) n.value = e.name || '';
      const t = el('evf-type'); if (t) t.value = e.type || 'other';
      const l = el('evf-loc');  if (l) l.value = e.location || '';
      const s = el('evf-start');if (s) s.value = (e.start_date || '').slice(0,16);
      const en= el('evf-end');  if (en) en.value = (e.end_date || '').slice(0,16);
      const d = el('evf-desc'); if (d) d.value = e.description || '';
    });
  }
}

async function saveEvent(eventId){
  const name = val('evf-name');
  const start = val('evf-start');
  if (!name) return formErr('evf-error', 'Name is required.');
  if (!start) return formErr('evf-error', 'Start date is required.');
  const fd = new FormData();
  fd.append('name', name);
  fd.append('type', el('evf-type').value);
  fd.append('start_date', new Date(start).toISOString());
  const end = val('evf-end'); if (end) fd.append('end_date', new Date(end).toISOString());
  const loc = val('evf-loc'); if (loc) fd.append('location', loc);
  const desc = val('evf-desc'); if (desc) fd.append('description', desc);
  const photo = el('evf-photo').files[0]; if (photo) fd.append('cover_photo', photo);
  if (!eventId) {
    fd.append('created_by', userId);
    fd.append('organizers', userId);
  }
  try {
    const res = eventId
      ? await apiFetch(`/api/collections/events/records/${eventId}`, { method:'PATCH', body: fd })
      : await apiFetch('/api/collections/events/records', { method:'POST', body: fd });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Save failed'); }
    const saved = await res.json();
    closeModal();
    navigate('events', { event: saved.id });
  } catch (e) { formErr('evf-error', e.message); }
}

async function deleteEvent(eventId){
  if (!confirm('Delete this event? This cannot be undone.')) return;
  try {
    const res = await apiFetch(`/api/collections/events/records/${eventId}`, { method:'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    closeModal();
    navigate('events');
  } catch (e) { toast(e.message, 'error'); }
}
```

- [ ] **Step 3: Run tests**

```bash
node --test helpers.test.js && node --test merge.test.js
```

Expected: `# pass 10` helpers, `# pass 3` merge, `# fail 0` both.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(events): Events screen — list, detail, RSVP, create/edit/delete modal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Home hero — dynamic next event + cleanup

**Files:**
- Modify: `app.js` — update `SCREENS.home` to fetch next upcoming event and remove hardcoded reunion references

**Interfaces:**
- Consumes: `events` collection via `apiFetch`
- Produces: home hero shows next event name, date, and "View event" button; falls back to generic welcome if no upcoming events

- [ ] **Step 1: Update SCREENS.home**

In `app.js`, find `SCREENS.home = async function(){` and update the function:

Replace the lines:
```js
  const days = daysUntil(REUNION_DATE, new Date());
  const reunionDate = new Date(REUNION_DATE + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
```

And the entire data-fetch block, replacing the three `apiFetch` calls with four (adding events), and the hero HTML:

```js
SCREENS.home = async function(){
  mountMain('<div class="screen-pad"><div class="spinner"></div></div>');
  let news = [], members = [], memberTotal = 0, branches = 0, nextEvent = null;
  try {
    const today = new Date().toISOString();
    const [nRes, uRes, pRes, eRes] = await Promise.all([
      apiFetch('/api/collections/news/records?sort=-created&perPage=50&expand=author'),
      apiFetch('/api/collections/users/records?filter=(approved=true)&perPage=200'),
      apiFetch('/api/collections/persons/records?perPage=500&fields=family_name'),
      apiFetch(`/api/collections/events/records?sort=start_date&perPage=1&filter=${encodeURIComponent(`(start_date>="${today}")`)}`),
    ]);
    if (nRes.ok) news = (await nRes.json()).items || [];
    if (uRes.ok) { const u = await uRes.json(); members = u.items || []; memberTotal = u.totalItems || members.length; }
    if (pRes.ok) {
      const persons = (await pRes.json()).items || [];
      branches = new Set(persons.map(p => (p.family_name || '').trim()).filter(Boolean)).size;
    }
    if (eRes.ok) { const ev = (await eRes.json()).items || []; nextEvent = ev[0] || null; }
  } catch { /* render with whatever loaded */ }

  const heroHtml = nextEvent
    ? (() => {
        const evDate = new Date(nextEvent.start_date).toLocaleDateString('en-US',
          { weekday:'long', month:'long', day:'numeric', year:'numeric' });
        const days = daysUntil(nextEvent.start_date.slice(0,10), new Date());
        return `<div class="reunion-hero">
          <div class="texture"></div>
          <div class="rh-left">
            <div class="rh-label">Next event</div>
            <div class="rh-name">${esc(nextEvent.name)}</div>
            <div class="rh-detail">${evDate}</div>
            <button class="btn btn-gold" style="margin-top:18px" onclick="navigate('events',{event:'${nextEvent.id}'})">View event</button>
          </div>
          <div class="rh-count">
            <div class="rh-num">${days}</div><div class="rh-days">days to go</div>
          </div>
        </div>`;
      })()
    : `<div class="reunion-hero">
        <div class="texture"></div>
        <div class="rh-left">
          <div class="rh-label">Welcome</div>
          <div class="rh-name">Kelsall Family</div>
          <div class="rh-detail">Explore the tree, photos, and more.</div>
          <button class="btn btn-gold" style="margin-top:18px" onclick="navigate('events')">See events</button>
        </div>
      </div>`;

  mountMain(`<div class="screen-pad">
    ${heroHtml}
    <div class="home-grid">
      <div>
        <div class="home-head">
          <span class="section-label">Announcements</span>
          <button class="btn btn-outline btn-sm" onclick="openNewsComposer()">Post update</button>
        </div>
        <div id="news-list">${renderNewsCards(news)}</div>
      </div>
      <aside class="home-rail">
        <div class="card">
          <div class="section-label" style="margin-bottom:.9rem">Upcoming birthdays</div>
          ${renderBirthdays(members)}
        </div>
        <div class="card">
          <div class="section-label" style="margin-bottom:.9rem">Family at a glance</div>
          <div class="glance"><span class="g-num">${memberTotal}</span><span class="g-lbl">members</span></div>
          <div class="glance"><span class="g-num">${branches || '—'}</span><span class="g-lbl">branches</span></div>
          <button class="btn btn-outline btn-full" style="margin-top:1rem" onclick="navigate('tree')">Open the family tree →</button>
        </div>
      </aside>
    </div>
  </div>`);
};
```

- [ ] **Step 2: Run tests**

```bash
node --test helpers.test.js && node --test merge.test.js
```

Expected: `# pass 10`, `# pass 3`, `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(events): home hero shows next upcoming event dynamically

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Deploy + smoke test

**Files:**
- No new files; backend deploy applies the two new migrations

- [ ] **Step 1: Push frontend**

```bash
git push origin main
```

- [ ] **Step 2: Deploy backend**

```bash
/home/james/.fly/bin/fly deploy --config backend/fly.toml
```

Expected: `✔ Machine ... is now in a good state`

- [ ] **Step 3: Smoke test (manual)**

1. Open `https://reunion.klsll.com`
2. Confirm Events appears in sidebar (not "Reunion")
3. Click Events — confirm empty state with "No upcoming events yet"
4. Click "+ Add event" — fill in name "Kelsall Reunion 2026", type "reunion", start date 2026-08-15, location "Kelsall Family Camp" — Save
5. Confirm the event appears in the upcoming list
6. Click the event card — confirm detail view with RSVP buttons
7. Click "I'm going" — confirm toast "RSVP saved" and button highlights
8. Go to Home — confirm hero shows "Kelsall Reunion 2026" with days countdown
9. Confirm no "Reunion" link anywhere in sidebar

- [ ] **Step 4: Commit (tag deploy)**

```bash
git commit --allow-empty -m "chore: events system deployed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
