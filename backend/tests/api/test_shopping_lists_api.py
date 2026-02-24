"""API tests for shopping list endpoints."""

import uuid

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part
from app.models.shopping_list import ShoppingListStatus
from app.models.shopping_list_seller import ShoppingListSellerStatus


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
        assert created["has_ordered_lines"] is False

        fetch_resp = client.get(f"/api/shopping-lists/{list_id}")
        assert fetch_resp.status_code == 200
        fetched = fetch_resp.get_json()
        assert fetched["name"] == name
        assert fetched["seller_groups"] == []
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

        active_list = shopping_list_service.create_list(f"Active-{uuid.uuid4()}")
        session.commit()

        done_list = shopping_list_service.create_list(f"Done-{uuid.uuid4()}")
        shopping_list_service.set_list_status(done_list.id, ShoppingListStatus.DONE)
        session.commit()

        list_resp = client.get("/api/shopping-lists")
        assert list_resp.status_code == 200
        overview_payload = list_resp.get_json()
        names = {entry["name"] for entry in overview_payload}
        assert active_list.name in names
        assert done_list.name not in names
        for entry in overview_payload:
            counts = entry["line_counts"]
            assert counts["total"] == counts["new"] + counts["ordered"] + counts["done"]
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
            assert "has_ordered_lines" in entry
            assert "last_updated" in entry
            assert entry["last_updated"] == entry["updated_at"]

    def test_list_endpoint_status_filter(self, client, session, container):
        shopping_list_service = container.shopping_list_service()

        active = shopping_list_service.create_list(f"Active-{uuid.uuid4()}")
        done = shopping_list_service.create_list(f"Done-{uuid.uuid4()}")
        shopping_list_service.set_list_status(done.id, ShoppingListStatus.DONE)
        session.commit()

        filtered = client.get("/api/shopping-lists?status=active")
        assert filtered.status_code == 200
        names = {entry["name"] for entry in filtered.get_json()}
        assert active.name in names
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

        shopping_list = shopping_list_service.create_list(f"Transitions-{uuid.uuid4()}")
        list_id = shopping_list.id
        session.commit()

        # Active -> done should work (no preconditions)
        done_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.DONE.value},
        )
        assert done_resp.status_code == 200
        assert done_resp.get_json()["status"] == ShoppingListStatus.DONE.value
        assert "seller_groups" in done_resp.get_json()

        # Done -> active should be rejected
        reopen_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.ACTIVE.value},
        )
        assert reopen_resp.status_code == 409
        assert (
            reopen_resp.get_json()["error"]
            == "Cannot change shopping list status because lists marked as done cannot change status"
        )

    def test_update_endpoint_rejects_done_lists(self, client, session, container):
        shopping_list_service = container.shopping_list_service()

        shopping_list = shopping_list_service.create_list(f"Metadata-{uuid.uuid4()}")
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


class TestSellerGroupAPI:
    """API tests for seller group CRUD endpoints."""

    def _setup_list_with_seller(self, container, session):
        """Create an active list, a seller, and a part with that seller."""
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller(
            f"Seller-{uuid.uuid4()}", "https://seller.example"
        )
        shopping_list = shopping_list_service.create_list(f"SG-{uuid.uuid4()}")
        part = part_service.create_part(description="Seller group part")
        shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part.id,
            needed=4,
            seller_id=seller.id,
        )
        session.commit()
        return shopping_list, seller

    def test_create_seller_group_endpoint(self, client, session, container):
        shopping_list, seller = self._setup_list_with_seller(container, session)

        resp = client.post(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups",
            json={"seller_id": seller.id},
        )
        assert resp.status_code == 201
        payload = resp.get_json()
        assert payload["group_key"] == str(seller.id)
        assert payload["seller"]["id"] == seller.id
        assert payload["totals"]["needed"] == 4
        assert payload["status"] == ShoppingListSellerStatus.ACTIVE.value

    def test_create_seller_group_duplicate_returns_conflict(self, client, session, container):
        shopping_list, seller = self._setup_list_with_seller(container, session)

        first = client.post(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups",
            json={"seller_id": seller.id},
        )
        assert first.status_code == 201

        duplicate = client.post(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups",
            json={"seller_id": seller.id},
        )
        assert duplicate.status_code == 409

    def test_get_seller_group_endpoint(self, client, session, container):
        shopping_list, seller = self._setup_list_with_seller(container, session)
        shopping_list_service = container.shopping_list_service()
        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        resp = client.get(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}"
        )
        assert resp.status_code == 200
        payload = resp.get_json()
        assert payload["group_key"] == str(seller.id)
        assert len(payload["lines"]) == 1

    def test_get_seller_group_not_found(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list = shopping_list_service.create_list(f"SG-NotFound-{uuid.uuid4()}")
        session.commit()

        resp = client.get(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/99999"
        )
        assert resp.status_code == 404

    def test_update_seller_group_note(self, client, session, container):
        shopping_list, seller = self._setup_list_with_seller(container, session)
        shopping_list_service = container.shopping_list_service()
        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}",
            json={"note": "Combine with bench order"},
        )
        assert resp.status_code == 200
        assert "lines" in resp.get_json()

    def test_update_seller_group_order_flow(self, client, session, container):
        """Order flow: set ordered qty on lines, then order the group."""
        shopping_list, seller = self._setup_list_with_seller(container, session)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        # Set ordered qty on lines
        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(line.id, ordered=line.needed)
        session.commit()

        resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}",
            json={"status": ShoppingListSellerStatus.ORDERED.value},
        )
        assert resp.status_code == 200
        payload = resp.get_json()
        assert payload["status"] == ShoppingListSellerStatus.ORDERED.value

    def test_update_seller_group_reopen_flow(self, client, session, container):
        """Reopen flow: order then reopen."""
        shopping_list, seller = self._setup_list_with_seller(container, session)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(line.id, ordered=line.needed)
        session.commit()

        shopping_list_service.update_seller_group(
            shopping_list.id, seller.id, status=ShoppingListSellerStatus.ORDERED
        )
        session.commit()

        resp = client.put(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}",
            json={"status": ShoppingListSellerStatus.ACTIVE.value},
        )
        assert resp.status_code == 200
        payload = resp.get_json()
        assert payload["status"] == ShoppingListSellerStatus.ACTIVE.value

    def test_delete_seller_group_endpoint(self, client, session, container):
        shopping_list, seller = self._setup_list_with_seller(container, session)
        shopping_list_service = container.shopping_list_service()
        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        resp = client.delete(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}"
        )
        assert resp.status_code == 204

        # Verify it's gone
        get_resp = client.get(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}"
        )
        assert get_resp.status_code == 404

    def test_delete_seller_group_blocks_ordered(self, client, session, container):
        shopping_list, seller = self._setup_list_with_seller(container, session)
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()

        shopping_list_service.create_seller_group(shopping_list.id, seller.id)
        session.commit()

        lines = shopping_list_line_service.list_lines(shopping_list.id)
        for line in lines:
            if line.seller_id == seller.id:
                shopping_list_line_service.update_line(line.id, ordered=line.needed)
        session.commit()

        shopping_list_service.update_seller_group(
            shopping_list.id, seller.id, status=ShoppingListSellerStatus.ORDERED
        )
        session.commit()

        resp = client.delete(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}"
        )
        assert resp.status_code == 409
