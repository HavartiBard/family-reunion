"""One-time backfill: create `trees` records and stamp existing persons/
branch_admins/users so Phase 3 (tree-scoped PocketBase rules) has zero null
`tree` values to worry about.

Not a PocketBase migration — migrations run on every fresh install/CI test
run and would incorrectly re-stamp fresh/test data; this is a production data
operation, run once against the live API with admin credentials.

Idempotent (every write compares current-vs-target and is a no-op if already
equal), supports --dry-run, follows the same conventions as
tools/gedcom_sync/gedcom_sync.py (PB.login, fill-blanks-only, dry-run counts).

Heavy I/O deps (requests) are imported lazily so the pure grouping / planning
functions remain unit-testable without them installed.
"""

import argparse
import os
import sys
from collections import defaultdict


# ── Pure grouping / planning logic ───────────────────────────────────────────
def surname_key(person):
    """Stable tree-grouping key: birth_surname if known, else family_name.

    Mirrors tools/gedcom_sync/gedcom_sync.py's own surname_key() — birth
    surname is the stable "family line" a person belongs to; a married/
    current surname is exactly the kind of cross-tree link the
    couples_tree_link.pb.js hook already resolves once both partners carry a
    `tree`, so it must not be folded into the same grouping key. Kept as a
    separate copy per-tool rather than a shared module, since this repo has
    no cross-tool shared package today — if the grouping rule ever changes,
    grep for `surname_key` across tools/.
    """
    return (person.get("birth_surname") or person.get("family_name") or "").strip()


def group_persons_by_surname(persons):
    """Returns (groups: {key: [person_id, ...]}, unkeyed: [person_id, ...]).

    `unkeyed` persons have neither birth_surname nor family_name set — never
    guessed at, always reported for manual resolution.
    """
    groups = defaultdict(list)
    unkeyed = []
    for p in persons:
        key = surname_key(p)
        if key:
            groups[key].append(p["id"])
        else:
            unkeyed.append(p["id"])
    return dict(groups), unkeyed


def plan_tree_for_key(key, existing_trees_by_surname):
    """Resolve-or-create a `trees` record for this surname key.
    Returns (action, tree_id_or_none) with action in {"match", "create"}."""
    existing = existing_trees_by_surname.get(key)
    if existing:
        return "match", existing["id"]
    return "create", None


def plan_person_tree_patch(person, target_tree_id):
    """Returns (patch_or_none, status) with status in {"updated", "noop"}."""
    if person.get("tree") == target_tree_id:
        return None, "noop"
    return {"tree": target_tree_id}, "updated"


def plan_branch_admin_patch(branch_admin, key_to_tree_id):
    """Returns (patch_or_none, status) with status in
    {"updated", "noop", "skipped_blank", "unmatched"}."""
    branch_text = (branch_admin.get("branch") or "").strip()
    if not branch_text:
        return None, "skipped_blank"
    target = key_to_tree_id.get(branch_text)
    if target is None:
        return None, "unmatched"
    current = set(branch_admin.get("tree") or [])
    if target in current:
        return None, "noop"
    return {"tree": sorted(current | {target})}, "updated"


def plan_user_home_tree_patch(user, person_by_linked_user):
    """Returns (patch_or_none, status) with status in {"updated", "noop"}.
    Fill-blank only: never overwrites an already-set home_tree."""
    person = person_by_linked_user.get(user["id"])
    if not person or not person.get("tree"):
        return None, "noop"
    if user.get("home_tree") == person["tree"]:
        return None, "noop"
    return {"home_tree": person["tree"]}, "updated"


def plan_user_admin_trees_patch(user, admin_tree_ids):
    """Returns (patch_or_none, status) with status in {"updated", "noop"}.
    Unions admin_tree_ids into the user's existing admin_trees, never
    overwriting/removing an existing value."""
    if not admin_tree_ids:
        return None, "noop"
    current = set(user.get("admin_trees") or [])
    merged = current | set(admin_tree_ids)
    if merged == current:
        return None, "noop"
    return {"admin_trees": sorted(merged)}, "updated"


def branch_admins_by_user(branch_admins):
    """{user_id: set(resolved tree ids)} from already-patched branch_admins
    rows (i.e. after plan_branch_admin_patch has been applied/merged)."""
    out = defaultdict(set)
    for ba in branch_admins:
        if ba.get("tree"):
            out[ba["user"]].update(ba["tree"])
    return dict(out)


# ── I/O: generic PocketBase client ───────────────────────────────────────────
class PB:
    def __init__(self, base, token):
        self.base = base.rstrip("/")
        self.h = {"Authorization": token, "Content-Type": "application/json"}

    @classmethod
    def login(cls, base, identity, password):
        import requests
        r = requests.post(f"{base.rstrip('/')}/api/admins/auth-with-password",
                          json={"identity": identity, "password": password},
                          timeout=15)
        r.raise_for_status()
        return cls(base, r.json()["token"])

    def list_all(self, collection, per_page=500):
        import requests
        items, page = [], 1
        while True:
            r = requests.get(f"{self.base}/api/collections/{collection}/records",
                             params={"perPage": per_page, "page": page},
                             headers=self.h, timeout=15)
            r.raise_for_status()
            data = r.json()
            items.extend(data["items"])
            if page >= data["totalPages"]:
                break
            page += 1
        return items

    def create(self, collection, fields):
        import requests
        r = requests.post(f"{self.base}/api/collections/{collection}/records",
                          json=fields, headers=self.h, timeout=15)
        r.raise_for_status()
        return r.json()

    def patch(self, collection, record_id, fields):
        import requests
        r = requests.patch(f"{self.base}/api/collections/{collection}/records/{record_id}",
                           json=fields, headers=self.h, timeout=15)
        r.raise_for_status()
        return r.json()


# ── Orchestration ────────────────────────────────────────────────────────────
def run(args):
    pb = PB.login(args.pb_url, args.admin_email, args.admin_password)
    dry_run = args.dry_run
    counts = defaultdict(int)

    persons = pb.list_all("persons")
    couples = pb.list_all("couples")
    branch_admins = pb.list_all("branch_admins")
    users = pb.list_all("users")
    existing_trees = pb.list_all("trees")

    # Step 1: group persons by surname key.
    groups, unkeyed = group_persons_by_surname(persons)
    counts["persons_unkeyed"] = len(unkeyed)

    # Step 2: resolve-or-create one tree per distinct key.
    existing_trees_by_surname = {t["surname"]: t for t in existing_trees if t.get("surname")}
    key_to_tree_id = {}
    for key in groups:
        action, tree_id = plan_tree_for_key(key, existing_trees_by_surname)
        if action == "match":
            counts["trees_matched"] += 1
            key_to_tree_id[key] = tree_id
        else:
            counts["trees_created"] += 1
            if dry_run:
                key_to_tree_id[key] = f"<new:{key}>"
            else:
                rec = pb.create("trees", {"name": key, "surname": key,
                                          "description": "Auto-created by Phase 2 tree backfill"})
                key_to_tree_id[key] = rec["id"]

    # Step 3: stamp persons.tree.
    persons_by_id = {p["id"]: p for p in persons}
    for key, person_ids in groups.items():
        target = key_to_tree_id[key]
        for pid in person_ids:
            patch, status = plan_person_tree_patch(persons_by_id[pid], target)
            counts[f"persons_{status}"] += 1
            if patch and not dry_run:
                pb.patch("persons", pid, patch)
                persons_by_id[pid]["tree"] = target

    # Step 4: re-trigger couples_tree_link.pb.js for every existing couple —
    # the hook only fires on couples create/update, so stamping persons.tree
    # in Step 3 alone never re-evaluates already-existing marriages.
    for c in couples:
        counts["couples_touched"] += 1
        if not dry_run:
            pb.patch("couples", c["id"], {"status": c["status"]})

    # Step 5: migrate branch_admins.branch (free text) -> branch_admins.tree.
    for ba in branch_admins:
        patch, status = plan_branch_admin_patch(ba, key_to_tree_id)
        counts[f"branch_admins_{status}"] += 1
        if patch and not dry_run:
            pb.patch("branch_admins", ba["id"], patch)
            ba["tree"] = patch["tree"]

    # Step 6: users.home_tree for already-linked users (fill-blank only).
    person_by_linked_user = {p["linked_user"]: p for p in persons_by_id.values() if p.get("linked_user")}
    users_by_id = {u["id"]: u for u in users}
    for u in users:
        patch, status = plan_user_home_tree_patch(u, person_by_linked_user)
        counts[f"users_home_tree_{status}"] += 1
        if patch and not dry_run:
            pb.patch("users", u["id"], patch)
            u["home_tree"] = patch["home_tree"]

    # Step 7: users.admin_trees for existing branch admins (union, not overwrite).
    admin_trees_by_user = branch_admins_by_user(branch_admins)
    for user_id, tree_ids in admin_trees_by_user.items():
        u = users_by_id.get(user_id)
        if not u:
            continue
        patch, status = plan_user_admin_trees_patch(u, tree_ids)
        counts[f"users_admin_trees_{status}"] += 1
        if patch and not dry_run:
            pb.patch("users", user_id, patch)

    return dict(counts)


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="One-time backfill: create trees + stamp persons/branch_admins/users.tree")
    ap.add_argument("--pb-url", default=os.environ.get("PB_URL", "http://192.168.20.14:8094"))
    ap.add_argument("--admin-email", default=os.environ.get("PB_ADMIN_EMAIL"))
    ap.add_argument("--admin-password", default=os.environ.get("PB_ADMIN_PASSWORD"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    missing = [n for n in ("admin_email", "admin_password") if not getattr(args, n)]
    if missing:
        print(f"ERROR: missing required config: {missing}", file=sys.stderr)
        return 2
    counts = run(args)
    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] " + " ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
