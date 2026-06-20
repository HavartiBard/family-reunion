# Registration → Tree Node Design

**Goal:** When a user registers, they are either linked to an existing `persons` record (claim, requires admin approval) or a new `persons` record is created for them automatically.

**Architecture:** Extend the registration flow with a post-signup "Find yourself in the tree" step. New `person_claims` collection tracks pending claims. Admin panel gains a Claims tab.

**Tech Stack:** PocketBase migration, raw JS/CSS, existing patterns.

---

## Global Constraints

- No build step — raw HTML/CSS/JS only
- All user-supplied strings pass through `esc()`
- `apiFetch` always sends `Authorization: token`
- PocketBase access rule base: `@request.auth.id != "" && @request.auth.approved = true`
- Design tokens from `:root` — no hardcoded colors
- Fonts: Newsreader (display) + Schibsted Grotesk (UI)
- Family name: "Kelsall"

---

## Data Model

### `person_claims` collection
| Field | Type | Notes |
|---|---|---|
| `person` | relation →persons, required | The node being claimed |
| `user` | relation →users, required | The claimant |
| `status` | select | pending / approved / denied |
| `note` | text | Optional message from claimant |

**Access rules:**
- `listRule` / `viewRule`: `@request.auth.id != "" && (user = @request.auth.id || @request.auth.family_admin = true)`
- `createRule`: `@request.auth.id != ""`  (unapproved users can claim during registration flow)
- `updateRule` / `deleteRule`: `@request.auth.family_admin = true`

---

## Registration Flow

### Step 1 — Existing signup form (unchanged)
User fills in first name, last name, email, phone, birthday, password. On submit: creates user record (`approved: false`), signs in, shows new Step 2 instead of the pending screen.

### Step 2 — "Find yourself in the tree" screen (new, shown after signup only)
Shown immediately after successful registration, before the pending screen.

```
┌─────────────────────────────────────────────────────┐
│  Are you already in the family tree?                │
│                                                     │
│  [Search by name…]                                  │
│                                                     │
│  [result rows — person card with name + years]      │
│                                                     │
│  [Claim this person]  ← on result row click         │
│                                                     │
│  [I'm not in the tree yet]  ← skip button          │
└─────────────────────────────────────────────────────┘
```

**Search:** client-side against `persons` records (fetched once, filtered with `filterPeople`). Shows name + birth year + photo if available.

**On "Claim this person":**
- If that person already has `linked_user` set: show "This person is already linked to an account."
- Otherwise: create a `person_claims` record (`person`, `user`, `status: pending`); proceed to pending screen with message "Your claim is awaiting admin approval."

**On "I'm not in the tree yet":**
- Create a new `persons` record: `display_name = first + last`, `given_name = first`, `family_name = last`, `living: true`, `linked_user = userId`
- Proceed to normal pending screen (account still needs approval)

---

## Admin Panel — Claims Tab

New tab in admin panel (site admins and branch admins — see branch admins spec).

Each pending claim shows:
- Claimant name + email
- Person node being claimed (name, birth year, photo)
- "Approve" → sets `person.linked_user = claim.user.id`, sets `claim.status = approved`, creates notification for user
- "Deny" → sets `claim.status = denied`, creates notification for user

Approved/denied claims shown in a collapsed history section.

---

## Notifications

- On claim approval: notification to user (`type: admin`, title: "Your tree claim was approved")
- On claim denial: notification to user (`type: admin`, title: "Your tree claim was not approved")
