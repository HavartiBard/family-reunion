from backfill_community_tree import (
    resolve_tree_by_name, plan_record_tree_patch,
    plan_service_account_home_tree_patch, is_service_account,
)


# ── resolve_tree_by_name ──────────────────────────────────────────────────────
def test_resolve_tree_by_name_matches_exact_name():
    trees = [{"id": "t1", "name": "Kelsall"}, {"id": "t2", "name": "Barrett"}]
    assert resolve_tree_by_name("Kelsall", trees) == {"id": "t1", "name": "Kelsall"}


def test_resolve_tree_by_name_returns_none_when_no_match():
    trees = [{"id": "t1", "name": "Kelsall"}]
    assert resolve_tree_by_name("Nonexistent", trees) is None


def test_resolve_tree_by_name_no_partial_match():
    trees = [{"id": "t1", "name": "Kelsall Family"}]
    assert resolve_tree_by_name("Kelsall", trees) is None


# ── plan_record_tree_patch ───────────────────────────────────────────────────
def test_plan_record_tree_patch_stamps_untreed_record():
    patch, status = plan_record_tree_patch({"id": "n1", "tree": ""}, "target-tree-id")
    assert patch == {"tree": "target-tree-id"}
    assert status == "updated"


def test_plan_record_tree_patch_noop_when_already_set():
    patch, status = plan_record_tree_patch({"id": "n1", "tree": "existing-tree"}, "target-tree-id")
    assert patch is None
    assert status == "noop"


def test_plan_record_tree_patch_treats_missing_key_as_untreed():
    patch, status = plan_record_tree_patch({"id": "n1"}, "target-tree-id")
    assert patch == {"tree": "target-tree-id"}
    assert status == "updated"


# ── plan_service_account_home_tree_patch ─────────────────────────────────────
def test_plan_service_account_home_tree_patch_updates_when_different():
    patch, status = plan_service_account_home_tree_patch({"home_tree": ""}, "svc-tree-id")
    assert patch == {"home_tree": "svc-tree-id"}
    assert status == "updated"


def test_plan_service_account_home_tree_patch_noop_when_already_set():
    patch, status = plan_service_account_home_tree_patch({"home_tree": "svc-tree-id"}, "svc-tree-id")
    assert patch is None
    assert status == "noop"


# ── is_service_account ───────────────────────────────────────────────────────
def test_is_service_account_matches_reunion_local_email():
    assert is_service_account({"email": "svc-gedcom-sync@reunion.local"}) is True


def test_is_service_account_rejects_real_email():
    assert is_service_account({"email": "james@klsll.com"}) is False


def test_is_service_account_handles_missing_email():
    assert is_service_account({}) is False
