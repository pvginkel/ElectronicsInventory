"""Tests for kit API endpoints."""

from datetime import UTC, datetime

from app.models.kit import Kit, KitStatus
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_shopping_list_link import KitShoppingListLink
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
                linked_status=ShoppingListStatus.CONCEPT,
            ),
            KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=ready_list.id,
                linked_status=ShoppingListStatus.READY,
            ),
            KitShoppingListLink(
                kit_id=kit.id,
                shopping_list_id=done_list.id,
                linked_status=ShoppingListStatus.DONE,
            ),
        ]
    )
    session.add_all(
        [
            KitPickList(
                kit_id=kit.id,
                requested_units=2,
                status=KitPickListStatus.IN_PROGRESS,
            ),
            KitPickList(
                kit_id=kit.id,
                requested_units=1,
                status=KitPickListStatus.DRAFT,
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


class TestKitsApi:
    """API-level tests covering kit overview and lifecycle endpoints."""

    def test_list_kits_returns_active_by_default(self, client, session):
        kit = _seed_badge_data(session)

        response = client.get("/api/kits")
        assert response.status_code == 200
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
        assert response.status_code == 200
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

    def test_update_kit_endpoint(self, client, session):
        kit = Kit(name="Mutable API Kit", description="Original", build_target=1)
        session.add(kit)
        session.commit()

        response = client.patch(
            f"/api/kits/{kit.id}",
            json={"description": "Updated", "build_target": 5},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["description"] == "Updated"
        assert data["build_target"] == 5

        empty_payload = client.patch(f"/api/kits/{kit.id}", json={})
        assert empty_payload.status_code == 400

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
        assert second_archive.status_code == 400

        unarchive_response = client.post(f"/api/kits/{kit.id}/unarchive")
        assert unarchive_response.status_code == 200
        unarchived = unarchive_response.get_json()
        assert unarchived["status"] == KitStatus.ACTIVE.value

        second_unarchive = client.post(f"/api/kits/{kit.id}/unarchive")
        assert second_unarchive.status_code == 400

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
        assert response.status_code == 400
