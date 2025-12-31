"""API tests for shopping list endpoints."""

import uuid

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part
from app.models.shopping_list import ShoppingListStatus


class TestShoppingListsAPI:
    """End-to-end tests covering shopping list API operations."""

    def test_create_get_update_delete_flow(self, client, session, container):
        name = f"List-{uuid.uuid4()}"

        create_resp = client.post(
            "/api/shopping-lists",
            json={
                "name": name,
                "description": "Initial build plan",
            },
        )
        assert create_resp.status_code == 201
        created = create_resp.get_json()
        list_id = created["id"]
        assert created["line_counts"] == {"new": 0, "ordered": 0, "done": 0, "total": 0}
        assert created["seller_groups"] == []
        assert created["seller_notes"] == []
        assert created["has_ordered_lines"] is False

        fetch_resp = client.get(f"/api/shopping-lists/{list_id}")
        assert fetch_resp.status_code == 200
        fetched = fetch_resp.get_json()
        assert fetched["name"] == name
        assert fetched["seller_groups"] == []
        assert fetched["seller_notes"] == []
        assert fetched["has_ordered_lines"] is False

        update_resp = client.put(
            f"/api/shopping-lists/{list_id}",
            json={"description": "Updated description"},
        )
        assert update_resp.status_code == 200
        assert update_resp.get_json()["description"] == "Updated description"
        assert update_resp.get_json()["seller_groups"] == []

        delete_resp = client.delete(f"/api/shopping-lists/{list_id}")
        assert delete_resp.status_code == 204

        not_found_resp = client.get(f"/api/shopping-lists/{list_id}")
        assert not_found_resp.status_code == 404

    def test_list_endpoint_filters_done(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        concept_list = shopping_list_service.create_list(f"Concept-{uuid.uuid4()}")
        session.commit()

        ready_list = shopping_list_service.create_list(f"Ready-{uuid.uuid4()}")
        ready_part = part_service.create_part(description="Ready resistor kit")
        shopping_list_line_service.add_line(ready_list.id, part_id=ready_part.id, needed=1)
        shopping_list_service.set_list_status(ready_list.id, ShoppingListStatus.READY)
        session.commit()

        done_list = shopping_list_service.create_list(f"Done-{uuid.uuid4()}")
        done_part = part_service.create_part(description="Done capacitor set")
        shopping_list_line_service.add_line(done_list.id, part_id=done_part.id, needed=1)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)
        session.commit()

        list_resp = client.get("/api/shopping-lists")
        assert list_resp.status_code == 200
        overview_payload = list_resp.get_json()
        names = {entry["name"] for entry in overview_payload}
        assert concept_list.name in names
        assert ready_list.name in names
        assert done_list.name not in names
        for entry in overview_payload:
            counts = entry["line_counts"]
            assert counts["total"] == counts["new"] + counts["ordered"] + counts["done"]
            assert "seller_notes" in entry
            assert "has_ordered_lines" in entry
            assert "last_updated" in entry
            assert entry["last_updated"] == entry["updated_at"]

        list_all_resp = client.get("/api/shopping-lists?include_done=true")
        assert list_all_resp.status_code == 200
        list_all_payload = list_all_resp.get_json()
        all_names = {entry["name"] for entry in list_all_payload}
        assert done_list.name in all_names
        for entry in list_all_payload:
            counts = entry["line_counts"]
            assert counts["total"] == counts["new"] + counts["ordered"] + counts["done"]
            assert "seller_notes" in entry
            assert "has_ordered_lines" in entry
            assert "last_updated" in entry
            assert entry["last_updated"] == entry["updated_at"]

    def test_list_endpoint_status_filter(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        part_service = container.part_service()
        shopping_list_line_service = container.shopping_list_line_service()

        concept = shopping_list_service.create_list(f"Concept-{uuid.uuid4()}")
        ready = shopping_list_service.create_list(f"Ready-{uuid.uuid4()}")
        done = shopping_list_service.create_list(f"Done-{uuid.uuid4()}")
        part = part_service.create_part(description="Filter resistor")
        shopping_list_line_service.add_line(ready.id, part_id=part.id, needed=1)
        shopping_list_line_service.add_line(done.id, part_id=part.id, needed=1)
        shopping_list_service.set_list_status(ready.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done.id, ShoppingListStatus.READY)
        shopping_list_service.set_list_status(done.id, ShoppingListStatus.DONE)
        session.commit()

        filtered = client.get("/api/shopping-lists?status=concept&status=ready")
        assert filtered.status_code == 200
        names = {entry["name"] for entry in filtered.get_json()}
        assert concept.name in names
        assert ready.name in names
        assert done.name not in names

        done_only = client.get("/api/shopping-lists?status=done")
        assert done_only.status_code == 200, done_only.get_json()
        assert done_only.get_json() == []

        done_included = client.get("/api/shopping-lists?status=done&include_done=true")
        assert done_included.status_code == 200
        done_names = {entry["name"] for entry in done_included.get_json()}
        assert done.name in done_names

        invalid = client.get("/api/shopping-lists?status=invalid")
        assert invalid.status_code == 409

    def test_status_transitions_validate_rules(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list(f"Transitions-{uuid.uuid4()}")
        list_id = shopping_list.id
        session.commit()

        invalid_ready_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.READY.value},
        )
        assert invalid_ready_resp.status_code == 409
        assert "at least one line item" in invalid_ready_resp.get_json()["error"].lower()

        invalid_done_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.DONE.value},
        )
        assert invalid_done_resp.status_code == 409
        assert "before completion" in invalid_done_resp.get_json()["error"].lower()

        part = part_service.create_part(description="Transition widget")
        part_id = part.id
        shopping_list_line_service.add_line(
            list_id,
            part_id=part_id,
            needed=1,
        )
        session.commit()

        ready_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.READY.value},
        )
        assert ready_resp.status_code == 200
        assert ready_resp.get_json()["status"] == ShoppingListStatus.READY.value
        assert "seller_groups" in ready_resp.get_json()

        done_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.DONE.value},
        )
        assert done_resp.status_code == 200
        assert done_resp.get_json()["status"] == ShoppingListStatus.DONE.value
        assert "seller_notes" in done_resp.get_json()

        reopen_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.READY.value},
        )
        assert reopen_resp.status_code == 409
        assert (
            reopen_resp.get_json()["error"]
            == "Cannot change shopping list status because lists marked as done cannot change status"
        )

    def test_upsert_seller_order_note_endpoint(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Signal Shop", "https://signals.example")
        part = part_service.create_part(description="Precision op-amp", seller_id=seller.id)

        shopping_list = shopping_list_service.create_list("Note Flow")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        session.commit()

        create_resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}/order-note",
            json={"note": "Combine with enclosure order"},
        )
        assert create_resp.status_code == 200
        note_payload = create_resp.get_json()
        assert note_payload["seller_id"] == seller.id
        assert note_payload["note"] == "Combine with enclosure order"
        assert note_payload["seller"]["name"] == "Signal Shop"

        clear_resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}/order-note",
            json={"note": ""},
        )
        assert clear_resp.status_code == 204

        fetch_resp = client.get(f"/api/shopping-lists/{shopping_list.id}")
        assert fetch_resp.status_code == 200
        assert fetch_resp.get_json()["seller_notes"] == []

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )
        session.commit()

        locked_resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}/order-note",
            json={"note": "Should be rejected"},
        )
        assert locked_resp.status_code == 409
        assert (
            locked_resp.get_json()["error"]
            == "Cannot update seller note because lists marked as done cannot be modified"
        )

    def test_update_endpoint_rejects_done_lists(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list(f"Metadata-{uuid.uuid4()}")
        part = part_service.create_part(description="Metadata resistor")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=1,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.DONE,
        )
        session.commit()

        update_resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}",
            json={"description": "Should fail"},
        )
        assert update_resp.status_code == 409

    def test_get_shopping_list_kits_endpoint(self, client, session, container, make_attachment_set):
        kit_attachment_set = make_attachment_set()
        part_attachment_set = make_attachment_set()
        kit = Kit(name="List Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
        part = Part(key="LIST1", description="List Part", attachment_set_id=part_attachment_set.id)
        session.add_all([kit, part])
        session.flush()
        content = KitContent(kit_id=kit.id, part_id=part.id, required_per_unit=1)
        session.add(content)
        session.commit()

        service = container.kit_shopping_list_service()
        result = service.create_or_append_list(
            kit.id,
            units=None,
            honor_reserved=False,
            shopping_list_id=None,
            note_prefix="Fallback",
            new_list_name="Linked Shopping List",
        )
        link = result.link
        assert link is not None

        response = client.get(f"/api/shopping-lists/{link.shopping_list_id}/kits")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 1
        entry = payload[0]
        assert entry["kit_id"] == kit.id
        assert entry["kit_name"] == kit.name
        assert entry["kit_status"] == KitStatus.ACTIVE.value
        assert entry["requested_units"] == kit.build_target

        missing = client.get("/api/shopping-lists/99999/kits")
        assert missing.status_code == 404
