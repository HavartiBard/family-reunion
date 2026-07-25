from backfill_tree import (
    surname_key, group_persons_by_surname, plan_tree_for_key,
    plan_person_tree_patch, plan_branch_admin_patch,
    plan_user_home_tree_patch, plan_user_admin_trees_patch,
    branch_admins_by_user,
)


# ── surname_key ──────────────────────────────────────────────────────────────
def test_surname_key_prefers_birth_surname():
    assert surname_key({"birth_surname": "Original", "family_name": "Married"}) == "Original"


def test_surname_key_falls_back_to_family_name():
    assert surname_key({"family_name": "Smith"}) == "Smith"


def test_surname_key_blank_when_neither_set():
    assert surname_key({}) == ""
    assert surname_key({"birth_surname": "", "family_name": ""}) == ""


def test_surname_key_strips_whitespace():
    assert surname_key({"family_name": "  Smith  "}) == "Smith"


# ── group_persons_by_surname ─────────────────────────────────────────────────
def test_group_persons_by_surname_groups_and_flags_unkeyed():
    persons = [
        {"id": "p1", "birth_surname": "Smith"},
        {"id": "p2", "family_name": "Smith"},
        {"id": "p3", "birth_surname": "Doe"},
        {"id": "p4"},
    ]
    groups, unkeyed = group_persons_by_surname(persons)
    assert groups == {"Smith": ["p1", "p2"], "Doe": ["p3"]}
    assert unkeyed == ["p4"]


# ── plan_tree_for_key ────────────────────────────────────────────────────────
def test_plan_tree_for_key_matches_existing():
    action, tree_id = plan_tree_for_key("Smith", {"Smith": {"id": "t1"}})
    assert (action, tree_id) == ("match", "t1")


def test_plan_tree_for_key_creates_when_missing():
    action, tree_id = plan_tree_for_key("Smith", {})
    assert (action, tree_id) == ("create", None)


# ── plan_person_tree_patch ───────────────────────────────────────────────────
def test_plan_person_tree_patch_updates_when_different():
    patch, status = plan_person_tree_patch({"tree": ""}, "t1")
    assert patch == {"tree": "t1"}
    assert status == "updated"


def test_plan_person_tree_patch_noop_when_already_set():
    patch, status = plan_person_tree_patch({"tree": "t1"}, "t1")
    assert patch is None
    assert status == "noop"


# ── plan_branch_admin_patch ──────────────────────────────────────────────────
def test_plan_branch_admin_patch_skips_blank_branch():
    patch, status = plan_branch_admin_patch({"branch": ""}, {})
    assert patch is None
    assert status == "skipped_blank"


def test_plan_branch_admin_patch_unmatched_when_no_tree_for_branch():
    patch, status = plan_branch_admin_patch({"branch": "Smith"}, {})
    assert patch is None
    assert status == "unmatched"


def test_plan_branch_admin_patch_noop_when_already_present():
    ba = {"branch": "Smith", "tree": ["t1"]}
    patch, status = plan_branch_admin_patch(ba, {"Smith": "t1"})
    assert patch is None
    assert status == "noop"


def test_plan_branch_admin_patch_unions_new_tree_without_dropping_existing():
    ba = {"branch": "Smith", "tree": ["t-other"]}
    patch, status = plan_branch_admin_patch(ba, {"Smith": "t1"})
    assert status == "updated"
    assert set(patch["tree"]) == {"t-other", "t1"}


# ── plan_user_home_tree_patch ─────────────────────────────────────────────────
def test_plan_user_home_tree_patch_fills_blank():
    user = {"id": "u1"}
    person_by_linked_user = {"u1": {"tree": "t1"}}
    patch, status = plan_user_home_tree_patch(user, person_by_linked_user)
    assert patch == {"home_tree": "t1"}
    assert status == "updated"


def test_plan_user_home_tree_patch_noop_when_no_linked_person():
    patch, status = plan_user_home_tree_patch({"id": "u1"}, {})
    assert patch is None
    assert status == "noop"


def test_plan_user_home_tree_patch_noop_when_linked_person_has_no_tree():
    user = {"id": "u1"}
    person_by_linked_user = {"u1": {"tree": ""}}
    patch, status = plan_user_home_tree_patch(user, person_by_linked_user)
    assert patch is None
    assert status == "noop"


def test_plan_user_home_tree_patch_never_overwrites_existing():
    user = {"id": "u1", "home_tree": "t-existing"}
    person_by_linked_user = {"u1": {"tree": "t-new"}}
    patch, status = plan_user_home_tree_patch(user, person_by_linked_user)
    assert patch == {"home_tree": "t-new"}
    assert status == "updated"


# ── plan_user_admin_trees_patch ───────────────────────────────────────────────
def test_plan_user_admin_trees_patch_unions():
    user = {"admin_trees": ["t-existing"]}
    patch, status = plan_user_admin_trees_patch(user, {"t-new"})
    assert set(patch["admin_trees"]) == {"t-existing", "t-new"}
    assert status == "updated"


def test_plan_user_admin_trees_patch_noop_when_already_superset():
    user = {"admin_trees": ["t1", "t2"]}
    patch, status = plan_user_admin_trees_patch(user, {"t1"})
    assert patch is None
    assert status == "noop"


def test_plan_user_admin_trees_patch_noop_when_no_new_trees():
    patch, status = plan_user_admin_trees_patch({"admin_trees": []}, set())
    assert patch is None
    assert status == "noop"


# ── branch_admins_by_user ─────────────────────────────────────────────────────
def test_branch_admins_by_user_merges_multiple_rows_per_user():
    branch_admins = [
        {"user": "u1", "tree": ["t1"]},
        {"user": "u1", "tree": ["t2"]},
        {"user": "u2", "tree": ["t3"]},
        {"user": "u3", "tree": []},
    ]
    result = branch_admins_by_user(branch_admins)
    assert result == {"u1": {"t1", "t2"}, "u2": {"t3"}}
