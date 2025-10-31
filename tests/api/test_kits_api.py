"""Tests for kit API endpoints."""

from datetime import UTC, datetime

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
from app.models.part import Part
from app.models.shopping_list import ShoppingList, ShoppingListStatus


def _seed_badge_data(session) -> Kit:
    """Create a kit with linked shopping lists and pick lists for GET tests."""
    concept_list = ShoppingList(name="Concept List", status=ShoppingListStatus.CONCEPT)
    ready_list = ShoppingList(name="Ready List", status=ShoppingListStatus.READY)
    done_list = ShoppingList(name="Done List", status=ShoppingListStatus.DONE)
    session.add_all([concept_list, ready_list, done_list])

    kit = Kit(
        name="Synth Overview Kit",
        description="Kit used to validate overview listing",
        build_target=4,
        status=KitStatus.ACTIVE,
    )
    session.add(kit)
    session.flush()

    session.add_all(
        [
            KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=concept_list.id,
                requested_units=kit.build_target,
                honor_reserved=False,
                snapshot_kit_updated_at=datetime.now(UTC),
            ),
            KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=ready_list.id,
                requested_units=kit.build_target,
                honor_reserved=True,
                snapshot_kit_updated_at=datetime.now(UTC),
            ),
            KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=done_list.id,
                requested_units=kit.build_target,
                honor_reserved=False,
                snapshot_kit_updated_at=datetime.now(UTC),
            ),
        ]
    )
    session.add_all(
        [
            KitPickList(
                kit_id=kit.id,
                requested_units=2,
                status=KitPickListStatus.OPEN,
            ),
            KitPickList(
                kit_id=kit.id,
                requested_units=1,
                status=KitPickListStatus.OPEN,
            ),
            KitPickList(
                kit_id=kit.id,
                requested_units=1,
                status=KitPickListStatus.COMPLETED,
                completed_at=datetime.now(UTC),
            ),
        ]
    )
    session.commit()
    return kit


def _seed_kit_with_content(session) -> tuple[Kit, Part, KitContent]:
    """Create a kit with a single kit content for detail tests."""
    kit = Kit(
        name="Detail API Kit",
        description="Kit for detail endpoint",
        build_target=2,
        status=KitStatus.ACTIVE,
    )
    part = Part(key="AP01", description="Detail part")
    session.add_all([kit, part])
    session.flush()

    content = KitContent(
        kit=kit,
        part=part,
        required_per_unit=2,
        note="Initial note",
    )
    session.add(content)
    session.commit()
    return kit, part, content


class TestKitsApi:
    """API-level tests covering kit overview and lifecycle endpoints."""

    def test_list_kits_returns_active_by_default(self, client, session):
        kit = _seed_badge_data(session)

        response = client.get("/api/kits")
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()
        assert isinstance(payload, list)
        assert payload[0]["name"] == kit.name
        assert payload[0]["shopping_list_badge_count"] == 2
        assert payload[0]["pick_list_badge_count"] == 2
        assert payload[0]["status"] == KitStatus.ACTIVE.value

        archived_response = client.get("/api/kits?status=archived")
        assert archived_response.status_code == 200
        assert archived_response.get_json() == []

    def test_list_kits_query_filters_results(self, client, session):
        kit = Kit(name="Portable Recorder Kit", description="Field recorder build", build_target=2)
        other = Kit(name="Bench Supply Kit", description="Bench power supply", build_target=1)
        session.add_all([kit, other])
        session.commit()

        response = client.get("/api/kits?query=recorder")
        assert response.status_code == 200, response.get_json()
        payload = response.get_json()
        assert len(payload) == 1
        assert payload[0]["name"] == "Portable Recorder Kit"

    def test_create_kit_endpoint(self, client, session):
        response = client.post(
            "/api/kits",
            json={
                "name": "New API Kit",
                "description": "Created through API",
                "build_target": 3,
            },
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["name"] == "New API Kit"
        assert data["build_target"] == 3
        assert data["shopping_list_badge_count"] == 0
        assert data["pick_list_badge_count"] == 0

        db_kit = session.query(Kit).filter_by(name="New API Kit").one()
        assert db_kit.description == "Created through API"

        zero_response = client.post(
            "/api/kits",
            json={
                "name": "Zero Target Kit",
                "description": "Allows zero build target",
                "build_target": 0,
            },
        )
        assert zero_response.status_code == 201
        zero_data = zero_response.get_json()
        assert zero_data["build_target"] == 0

        negative_response = client.post(
            "/api/kits",
            json={
                "name": "Invalid Negative Kit",
                "build_target": -1,
            },
        )
        assert negative_response.status_code == 400

    def test_update_kit_endpoint(self, client, session):
        kit = Kit(name="Mutable API Kit", description="Original", build_target=1)
        session.add(kit)
        session.commit()

        response = client.patch(
            f"/api/kits/{kit.id}",
            json={"description": "Updated", "build_target": 5},
        )
        assert response.status_code == 200, response.get_data(as_text=True)
        data = response.get_json()
        assert data["description"] == "Updated"
        assert data["build_target"] == 5

        zero_update = client.patch(
            f"/api/kits/{kit.id}",
            json={"build_target": 0},
        )
        assert zero_update.status_code == 200
        zero_payload = zero_update.get_json()
        assert zero_payload["build_target"] == 0

        negative_update = client.patch(
            f"/api/kits/{kit.id}",
            json={"build_target": -1},
        )
        assert negative_update.status_code == 400

        empty_payload = client.patch(f"/api/kits/{kit.id}", json={})
        assert empty_payload.status_code == 409

    def test_archive_and_unarchive_endpoints(self, client, session):
        kit = Kit(name="Lifecycle API Kit", build_target=2)
        session.add(kit)
        session.commit()

        archive_response = client.post(f"/api/kits/{kit.id}/archive")
        assert archive_response.status_code == 200
        archived = archive_response.get_json()
        assert archived["status"] == KitStatus.ARCHIVED.value
        assert archived["archived_at"] is not None

        second_archive = client.post(f"/api/kits/{kit.id}/archive")
        assert second_archive.status_code == 409

        unarchive_response = client.post(f"/api/kits/{kit.id}/unarchive")
        assert unarchive_response.status_code == 200
        unarchived = unarchive_response.get_json()
        assert unarchived["status"] == KitStatus.ACTIVE.value

        second_unarchive = client.post(f"/api/kits/{kit.id}/unarchive")
        assert second_unarchive.status_code == 409

    def test_get_kits_rejects_invalid_status(self, client):
        response = client.get("/api/kits?status=bogus")
        assert response.status_code == 400

    def test_update_archived_kit_returns_error(self, client, session):
        kit = Kit(
            name="Archived API Kit",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        session.add(kit)
        session.commit()

        response = client.patch(
            f"/api/kits/{kit.id}",
            json={"description": "Should fail"},
        )
        assert response.status_code == 409

    def test_get_kit_shopping_lists_endpoint(self, client, session):
        kit = _seed_badge_data(session)

        response = client.get(f"/api/kits/{kit.id}/shopping-lists")
        assert response.status_code == 200
        payload = response.get_json()
        assert isinstance(payload, list)
        names = {entry["shopping_list_name"] for entry in payload}
        assert names == {"Concept List", "Ready List", "Done List"}
        for entry in payload:
            assert "requested_units" in entry
            assert "honor_reserved" in entry
            assert "snapshot_kit_updated_at" in entry

    def test_post_kit_shopping_lists_creates_new_list(self, client, session):
        kit, part, _ = _seed_kit_with_content(session)

        response = client.post(
            f"/api/kits/{kit.id}/shopping-lists",
            json={
                "honor_reserved": False,
                "note_prefix": "Fallback",
                "new_list_name": "API Push",
            },
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["created_new_list"] is True
        assert data["noop"] is False
        assert data["link"]["shopping_list_name"] == "API Push"
        assert data["link"]["requested_units"] == kit.build_target
        assert data["link"]["shopping_list_id"] is not None
        assert data["shopping_list"]["status"] == ShoppingListStatus.CONCEPT.value
        line_payload = data["shopping_list"]["lines"][0]
        assert line_payload["part_id"] == part.id
        assert line_payload["needed"] == kit.build_target * 2
        assert line_payload["note"].startswith("[From Kit")

    def test_post_kit_shopping_lists_appends_existing_list(self, client, session):
        kit, _, _ = _seed_kit_with_content(session)

        initial_response = client.post(
            f"/api/kits/{kit.id}/shopping-lists",
            json={
                "honor_reserved": False,
                "note_prefix": "Fallback",
                "new_list_name": "Append Flow",
            },
        )
        initial = initial_response.get_json()
        list_id = initial["link"]["shopping_list_id"]
        base_needed = initial["shopping_list"]["lines"][0]["needed"]

        response = client.post(
            f"/api/kits/{kit.id}/shopping-lists",
            json={
                "shopping_list_id": list_id,
                "units": 1,
                "honor_reserved": False,
                "note_prefix": "Fallback",
            },
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["created_new_list"] is False
        assert data["link"]["requested_units"] == 1
        assert data["lines_modified"] == 1
        assert data["shopping_list"]["lines"][0]["needed"] == base_needed + 2

    def test_post_kit_shopping_lists_rejects_non_concept(self, client, session):
        kit, _, _ = _seed_kit_with_content(session)
        shopping_list = ShoppingList(name="Ready Target", status=ShoppingListStatus.READY)
        session.add(shopping_list)
        session.commit()

        response = client.post(
            f"/api/kits/{kit.id}/shopping-lists",
            json={
                "shopping_list_id": shopping_list.id,
                "honor_reserved": False,
                "note_prefix": "Fallback",
            },
        )

        assert response.status_code == 409
        assert "concept" in response.get_json()["error"].lower()

    def test_post_kit_shopping_lists_rejects_archived_kits(self, client, session):
        kit = Kit(
            name="Archived Push",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        session.add(kit)
        session.commit()

        response = client.post(
            f"/api/kits/{kit.id}/shopping-lists",
            json={
                "honor_reserved": False,
                "note_prefix": "Fallback",
                "new_list_name": "Should Fail",
            },
        )

        assert response.status_code == 409

    def test_post_kits_shopping_list_memberships_query(self, client, session):
        kit_with_links = _seed_badge_data(session)
        empty_kit = Kit(name="Empty Membership", build_target=1, status=KitStatus.ACTIVE)
        session.add(empty_kit)
        session.commit()

        response = client.post(
            "/api/kits/shopping-list-memberships/query",
            json={"kit_ids": [kit_with_links.id, empty_kit.id]},
        )
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()
        assert payload["memberships"][0]["kit_id"] == kit_with_links.id
        first_memberships = payload["memberships"][0]["memberships"]
        names = [entry["shopping_list_name"] for entry in first_memberships]
        assert set(names) == {"Concept List", "Ready List"}
        assert payload["memberships"][1]["kit_id"] == empty_kit.id
        assert payload["memberships"][1]["memberships"] == []

        include_done = client.post(
            "/api/kits/shopping-list-memberships/query",
            json={
                "kit_ids": [kit_with_links.id],
                "include_done": True,
            },
        )
        assert include_done.status_code == 200, include_done.get_json()
        include_payload = include_done.get_json()
        done_names = [
            entry["shopping_list_name"]
            for entry in include_payload["memberships"][0]["memberships"]
        ]
        assert "Done List" in done_names

    def test_post_kits_pick_list_memberships_query(self, client, session):
        kit_with_pick_lists = _seed_badge_data(session)
        extra = Kit(name="No Picks", build_target=1, status=KitStatus.ACTIVE)
        session.add(extra)
        session.commit()

        response = client.post(
            "/api/kits/pick-list-memberships/query",
            json={"kit_ids": [kit_with_pick_lists.id, extra.id]},
        )
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["memberships"][0]["kit_id"] == kit_with_pick_lists.id
        pick_lists = payload["memberships"][0]["pick_lists"]
        statuses = {entry["status"] for entry in pick_lists}
        assert statuses == {KitPickListStatus.OPEN.value}
        assert payload["memberships"][1]["pick_lists"] == []

        include_done = client.post(
            "/api/kits/pick-list-memberships/query",
            json={
                "kit_ids": [kit_with_pick_lists.id],
                "include_done": True,
            },
        )
        assert include_done.status_code == 200
        include_payload = include_done.get_json()
        include_statuses = {
            entry["status"]
            for entry in include_payload["memberships"][0]["pick_lists"]
        }
        assert KitPickListStatus.COMPLETED.value in include_statuses

    def test_post_kits_membership_query_missing_kit_returns_404(self, client, session):
        kit = Kit(name="Existing Kit", build_target=1, status=KitStatus.ACTIVE)
        session.add(kit)
        session.commit()

        response = client.post(
            "/api/kits/shopping-list-memberships/query",
            json={"kit_ids": [kit.id, kit.id + 999]},
        )
        assert response.status_code == 404

    def test_get_kit_detail_endpoint_returns_computed_fields(self, client, session):
        kit, part, _ = _seed_kit_with_content(session)

        shopping_list = ShoppingList(name="Detail Link", status=ShoppingListStatus.CONCEPT)
        session.add(shopping_list)
        session.flush()
        session.add(
            KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=shopping_list.id,
                requested_units=kit.build_target,
                honor_reserved=False,
                snapshot_kit_updated_at=datetime.now(UTC),
            )
        )
        session.add(
            KitPickList(
                kit_id=kit.id,
                requested_units=1,
                status=KitPickListStatus.OPEN,
            )
        )
        session.commit()

        response = client.get(f"/api/kits/{kit.id}")
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["id"] == kit.id
        assert payload["contents"][0]["part_id"] == part.id
        assert payload["contents"][0]["total_required"] == kit.build_target * 2
        assert payload["contents"][0]["in_stock"] == 0
        assert payload["contents"][0]["reserved"] == 0
        assert payload["contents"][0]["shortfall"] == kit.build_target * 2
        assert payload["contents"][0]["active_reservations"] == []
        link_payload = payload["shopping_list_links"][0]
        assert link_payload["shopping_list_id"] == shopping_list.id
        assert link_payload["shopping_list_name"] == shopping_list.name
        assert link_payload["status"] == ShoppingListStatus.CONCEPT.value
        assert link_payload["requested_units"] == kit.build_target
        assert link_payload["honor_reserved"] is False
        assert link_payload["is_stale"] is False
        pick_summary = payload["pick_lists"][0]
        assert pick_summary["status"] == KitPickListStatus.OPEN.value
        assert pick_summary["line_count"] == 0
        assert pick_summary["open_line_count"] == 0
        assert pick_summary["is_archived_ui"] is False

    def test_kit_detail_includes_active_reservation_breakdown(self, client, session):
        kit, part, content = _seed_kit_with_content(session)
        other = Kit(name="Other Reserve Kit", build_target=2, status=KitStatus.ACTIVE)
        session.add(other)
        session.flush()
        session.add(KitContent(kit=other, part=part, required_per_unit=1))
        session.commit()

        response = client.get(f"/api/kits/{kit.id}")
        assert response.status_code == 200
        payload = response.get_json()
        reservations = payload["contents"][0]["active_reservations"]
        assert len(reservations) == 1
        assert reservations[0]["kit_id"] == other.id
        assert reservations[0]["reserved_quantity"] == other.build_target

    def test_create_kit_content_endpoint(self, client, session):
        kit, part, _ = _seed_kit_with_content(session)
        new_part = Part(key="AP02", description="New content part")
        session.add(new_part)
        session.commit()

        response = client.post(
            f"/api/kits/{kit.id}/contents",
            json={"part_id": new_part.id, "required_per_unit": 1},
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["part_id"] == new_part.id
        assert data["required_per_unit"] == 1
        assert data["total_required"] == kit.build_target
        assert data["active_reservations"] == []

        db_content = session.get(KitContent, data["id"])
        assert db_content is not None

        duplicate = client.post(
            f"/api/kits/{kit.id}/contents",
            json={"part_id": new_part.id, "required_per_unit": 1},
        )
        assert duplicate.status_code == 409

    def test_update_kit_content_endpoint(self, client, session):
        kit, part, content = _seed_kit_with_content(session)
        stale_version = content.version

        response = client.patch(
            f"/api/kits/{kit.id}/contents/{content.id}",
            json={
                "version": content.version,
                "required_per_unit": 4,
                "note": "Updated note",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["required_per_unit"] == 4
        assert data["note"] == "Updated note"
        assert data["version"] == stale_version + 1
        assert data["active_reservations"] == []

        conflict = client.patch(
            f"/api/kits/{kit.id}/contents/{content.id}",
            json={"version": stale_version, "required_per_unit": 3},
        )
        assert conflict.status_code == 409

    def test_delete_kit_content_endpoint(self, client, session):
        kit, _, content = _seed_kit_with_content(session)

        response = client.delete(f"/api/kits/{kit.id}/contents/{content.id}")
        assert response.status_code == 204
        assert session.get(KitContent, content.id) is None

    def test_kit_content_operations_blocked_for_archived_kit(self, client, session):
        kit = Kit(
            name="Archived Content Kit",
            build_target=1,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        part = Part(key="AP03", description="Archived part")
        session.add_all([kit, part])
        session.flush()
        content = KitContent(kit=kit, part=part, required_per_unit=1)
        session.add(content)
        session.commit()

        create_response = client.post(
            f"/api/kits/{kit.id}/contents",
            json={"part_id": part.id, "required_per_unit": 1},
        )
        assert create_response.status_code == 409

        update_response = client.patch(
            f"/api/kits/{kit.id}/contents/{content.id}",
            json={"version": content.version, "required_per_unit": 2},
        )
        assert update_response.status_code == 409

        delete_response = client.delete(f"/api/kits/{kit.id}/contents/{content.id}")
        assert delete_response.status_code == 409

    def test_create_kit_content_invalid_part_returns_404(self, client, session):
        kit, _, _ = _seed_kit_with_content(session)
        response = client.post(
            f"/api/kits/{kit.id}/contents",
            json={"part_id": 99999, "required_per_unit": 1},
        )
        assert response.status_code == 404

    def test_delete_kit_endpoint_success(self, client, session):
        """Delete kit returns HTTP 204 and removes kit from database."""
        kit = Kit(name="Kit To Delete", build_target=1)
        session.add(kit)
        session.commit()

        kit_id = kit.id
        response = client.delete(f"/api/kits/{kit_id}")
        assert response.status_code == 204
        assert response.data == b""
        assert session.get(Kit, kit_id) is None

    def test_delete_kit_endpoint_not_found(self, client, session):
        """Delete nonexistent kit returns HTTP 404."""
        response = client.delete("/api/kits/99999")
        assert response.status_code == 404
        payload = response.get_json()
        assert "error" in payload

    def test_delete_kit_endpoint_cascades_child_records(self, client, session):
        """Delete kit with child records removes all related data."""
        kit = Kit(name="Kit With Children", build_target=1)
        part = Part(key="DK01", description="Delete test part")
        shopping_list = ShoppingList(name="Delete List", status=ShoppingListStatus.CONCEPT)
        session.add_all([kit, part, shopping_list])
        session.flush()

        content = KitContent(kit=kit, part=part, required_per_unit=2)
        pick_list = KitPickList(
            kit_id=kit.id,
            requested_units=1,
            status=KitPickListStatus.OPEN,
        )
        link = KitShoppingListLink(
            kit_id=kit.id,
            shopping_list_id=shopping_list.id,
            requested_units=1,
            honor_reserved=False,
            snapshot_kit_updated_at=datetime.now(UTC),
        )
        session.add_all([content, pick_list, link])
        session.commit()

        kit_id = kit.id
        content_id = content.id
        pick_list_id = pick_list.id
        link_id = link.id

        response = client.delete(f"/api/kits/{kit_id}")
        assert response.status_code == 204

        # Verify kit and all child records are deleted
        assert session.get(Kit, kit_id) is None
        assert session.get(KitContent, content_id) is None
        assert session.get(KitPickList, pick_list_id) is None
        assert session.get(KitShoppingListLink, link_id) is None

        # Verify part and shopping list still exist
        assert session.get(Part, part.id) is not None
        assert session.get(ShoppingList, shopping_list.id) is not None
