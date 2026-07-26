"""One-time backfill for Phase 6 (community-layer tree scoping): stamps
`tree` onto every currently-untreed `news`/`events`/`albums` record, and
repoints the 3 `svc-*` service-account users onto a dedicated, deliberately
unlinked "Service Accounts" tree.

Not a PocketBase migration -- migrations run on every fresh install/CI test
run and would incorrectly re-stamp fresh/test data; this is a production
data operation, run once against the live API with admin credentials,
following the same conventions as tools/backfill_tree/backfill_tree.py.

Unlike persons (grouped by birth_surname), news/events/albums have no
natural per-record grouping key -- every currently-untreed record gets
assigned to a single, explicitly-named --target-tree (resolved by name
against real `trees` records at runtime; fails loud if it doesn't exist,
never guesses).

Idempotent (every write compares current-vs-target and is a no-op if
already equal), supports --dry-run.
"""

import argparse
import os
import sys
from collections import defaultdict


# ── Pure planning logic ──────────────────────────────────────────────────────
def resolve_tree_by_name(name, trees):
    """Returns the matching tree dict, or None if no exact name match exists."""
    for t in trees:
        if t.get("name") == name:
            return t
    return None


def plan_record_tree_patch(record, target_tree_id):
    """Returns (patch_or_none, status) with status in {"updated", "noop"}.
    Fill-blank only: never overwrites an already-set tree."""
    if record.get("tree"):
        return None, "noop"
    return {"tree": target_tree_id}, "updated"


def plan_service_account_home_tree_patch(user, service_tree_id):
    """Returns (patch_or_none, status) with status in {"updated", "noop"}."""
    if user.get("home_tree") == service_tree_id:
        return None, "noop"
    return {"home_tree": service_tree_id}, "updated"


def is_service_account(user):
    return (user.get("email") or "").endswith("@reunion.local")


# ── I/O: generic PocketBase client (mirrors tools/backfill_tree/'s PB) ──────
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

    trees = pb.list_all("trees")
    target_tree = resolve_tree_by_name(args.target_tree, trees)
    if target_tree is None:
        print(f"ERROR: --target-tree '{args.target_tree}' does not match any "
              f"existing trees.name. Existing trees: "
              f"{sorted(t.get('name') for t in trees)}", file=sys.stderr)
        return 2
    target_tree_id = target_tree["id"]

    # Step 1: stamp tree on every untreed news/events/albums record.
    for collection in ("news", "events", "albums"):
        records = pb.list_all(collection)
        for r in records:
            patch, status = plan_record_tree_patch(r, target_tree_id)
            counts[f"{collection}_{status}"] += 1
            if patch and not dry_run:
                pb.patch(collection, r["id"], patch)

    # Step 2: resolve-or-create the dedicated, deliberately unlinked
    # "Service Accounts" tree, and repoint every svc-* user's home_tree onto
    # it -- this is what makes them invisible to every real tree's scoped
    # view (nothing ever links to this tree), while family_admin still sees
    # them via the unconditional hook bypass.
    service_tree = resolve_tree_by_name("Service Accounts", trees)
    if service_tree is None:
        counts["service_tree_created"] += 1
        if dry_run:
            service_tree_id = "<new:Service Accounts>"
        else:
            service_tree = pb.create("trees", {
                "name": "Service Accounts",
                "surname": "Service Accounts",
                "description": "Deliberately unlinked to any real family tree -- "
                                "home for gedcom_sync/ai_research_mcp/photos_sync "
                                "service accounts so they never appear in any real "
                                "tree's scoped directory/community views.",
            })
            service_tree_id = service_tree["id"]
    else:
        counts["service_tree_matched"] += 1
        service_tree_id = service_tree["id"]

    users = pb.list_all("users")
    for u in users:
        if not is_service_account(u):
            continue
        patch, status = plan_service_account_home_tree_patch(u, service_tree_id)
        counts[f"users_service_home_tree_{status}"] += 1
        if patch and not dry_run:
            pb.patch("users", u["id"], patch)

    return dict(counts)


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="One-time backfill: stamp tree on news/events/albums, "
                     "isolate service accounts onto a dedicated tree")
    ap.add_argument("--pb-url", default=os.environ.get("PB_URL", "http://192.168.20.14:8094"))
    ap.add_argument("--admin-email", default=os.environ.get("PB_ADMIN_EMAIL"))
    ap.add_argument("--admin-password", default=os.environ.get("PB_ADMIN_PASSWORD"))
    ap.add_argument("--target-tree", required=True,
                    help="Exact trees.name to assign all existing untreed "
                         "news/events/albums records to (e.g. 'Kelsall')")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    missing = [n for n in ("admin_email", "admin_password") if not getattr(args, n)]
    if missing:
        print(f"ERROR: missing required config: {missing}", file=sys.stderr)
        return 2
    counts = run(args)
    if isinstance(counts, int):
        return counts
    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] " + " ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
