"""API tests for shopping list line endpoints."""

import uuid

from app.models.shopping_list import ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus


class TestShoppingListLinesAPI:
    """End-to-end tests for shopping list line CRUD operations."""

    def _setup_list_and_part(self, container, session) -> tuple[int, int, str]:
        shopping_list_service = container.shopping_list_service()
        part_service = container.part_service()

        shopping_list = shopping_list_service.create_list(f"Lines-{uuid.uuid4()}")
        part = part_service.create_part(description="Fixture regulator")
        list_id = shopping_list.id
        part_id = part.id
        part_key = part.key
        session.commit()
        return list_id, part_id, part_key

    def test_line_crud_flow(self, client, session, container):
        shopping_list_id, part_id, part_key = self._setup_list_and_part(container, session)
        seller = container.seller_service().create_seller(
            f"Seller-{uuid.uuid4()}",
            "https://seller.example.com",
        )
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={
                "part_id": part_id,
                "needed": 3,
                "note": "Initial requirement",
            },
        )
        assert create_resp.status_code == 201
        created = create_resp.get_json()
        line_id = created["id"]
        assert created["status"] == ShoppingListLineStatus.NEW.value
        assert created["part_id"] == part_id
        assert created["part"]["key"] == part_key
        assert created["seller"] is None

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={
                "needed": 5,
                "seller_id": seller.id,
                "note": "Prefer DigiKey stock",
            },
        )
        assert update_resp.status_code == 200
        updated = update_resp.get_json()
        assert updated["needed"] == 5
        assert updated["seller"]["id"] == seller.id
        assert updated["note"] == "Prefer DigiKey stock"
        assert updated["seller"]["id"] == seller.id
        assert updated["seller_id"] == seller.id

        list_resp = client.get(f"/api/shopping-lists/{shopping_list_id}/lines")
        assert list_resp.status_code == 200
        lines_payload = list_resp.get_json()
        assert len(lines_payload["lines"]) == 1
        line_entry = lines_payload["lines"][0]
        assert line_entry["needed"] == 5
        assert line_entry["part_id"] == part_id
        assert "seller_id" in line_entry

        delete_resp = client.delete(f"/api/shopping-list-lines/{line_id}")
        assert delete_resp.status_code == 204

        list_after_delete = client.get(f"/api/shopping-lists/{shopping_list_id}/lines")
        assert list_after_delete.status_code == 200
        assert list_after_delete.get_json()["lines"] == []

    def test_update_line_clears_seller_override(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        seller = container.seller_service().create_seller(
            f"Seller-{uuid.uuid4()}",
            "https://vendor.example.com",
        )
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={
                "part_id": part_id,
                "needed": 2,
                "seller_id": seller.id,
            },
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        clear_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"seller_id": None},
        )
        assert clear_resp.status_code == 200
        cleared = clear_resp.get_json()
        assert cleared["seller_id"] is None
        assert cleared["seller"] is None

    def test_update_line_null_note_preserves_existing(self, client, session, container):
        """Sending note=null is treated as 'not provided' and preserves the existing note."""
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2, "note": "Keep me"},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"note": None},
        )
        assert update_resp.status_code == 200
        assert update_resp.get_json()["note"] == "Keep me"

    def test_update_line_normalizes_empty_note_to_null(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2, "note": "Has content"},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        clear_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"note": ""},
        )
        assert clear_resp.status_code == 200
        assert clear_resp.get_json()["note"] is None

    def test_update_line_preserves_note_when_omitted(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2, "note": "Should survive"},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"needed": 5},
        )
        assert update_resp.status_code == 200
        assert update_resp.get_json()["note"] == "Should survive"

    def test_update_line_sets_ordered_field(self, client, session, container):
        """PUT accepts ordered field on NEW lines."""
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 4},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"ordered": 3},
        )
        assert update_resp.status_code == 200
        assert update_resp.get_json()["ordered"] == 3

    def test_update_line_ordered_rejects_on_ordered_line(self, client, session, container):
        """PUT rejects ordered field changes on ORDERED lines."""
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 4},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        # Manually set line to ORDERED
        stored_line = session.get(ShoppingListLine, line_id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 4
        session.flush()

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"ordered": 2},
        )
        assert update_resp.status_code == 409

    def test_update_line_seller_blocked_on_ordered(self, client, session, container):
        """PUT rejects seller_id changes on ORDERED lines."""
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        seller_a = container.seller_service().create_seller(
            f"A-{uuid.uuid4()}", "https://a.example"
        )
        seller_b = container.seller_service().create_seller(
            f"B-{uuid.uuid4()}", "https://b.example"
        )
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 4, "seller_id": seller_a.id},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        # Manually set line to ORDERED
        stored_line = session.get(ShoppingListLine, line_id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 4
        session.flush()

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"seller_id": seller_b.id},
        )
        assert update_resp.status_code == 409

    def test_duplicate_line_returns_conflict(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        first_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2},
        )
        assert first_resp.status_code == 201

        duplicate_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 1},
        )
        assert duplicate_resp.status_code == 409

    def test_list_lines_filters_done(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        extra_part = container.part_service().create_part(description="LED strip")
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 1},
        )
        assert create_resp.status_code == 201
        done_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": extra_part.id, "needed": 2},
        )
        assert done_resp.status_code == 201
        done_line_id = done_resp.get_json()["id"]

        done_line = session.get(ShoppingListLine, done_line_id)
        assert done_line is not None
        done_line.status = ShoppingListLineStatus.DONE
        session.flush()

        active_resp = client.get(
            f"/api/shopping-lists/{shopping_list_id}/lines?include_done=false"
        )
        assert active_resp.status_code == 200
        lines = active_resp.get_json()["lines"]
        assert len(lines) == 1
        assert lines[0]["part_id"] == part_id

        all_resp = client.get(f"/api/shopping-lists/{shopping_list_id}/lines")
        assert all_resp.status_code == 200
        all_ids = {line["id"] for line in all_resp.get_json()["lines"]}
        assert done_line_id in all_ids

    def test_update_with_unknown_seller_returns_not_found(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2},
        )
        line_id = create_resp.get_json()["id"]

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"seller_id": 9999},
        )
        assert update_resp.status_code == 404

    def test_receive_line_stock_endpoint_success(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        box = container.box_service().create_box("API Receive Box", 5)
        seller = container.seller_service().create_seller(
            f"Recv-{uuid.uuid4()}", "https://recv.example"
        )
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 4, "seller_id": seller.id},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        # Manually set to ORDERED for receiving
        stored_line = session.get(ShoppingListLine, line_id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 4
        session.flush()

        receive_payload = {
            "receive_qty": 3,
            "allocations": [
                {"box_no": box.box_no, "loc_no": 1, "qty": 2},
                {"box_no": box.box_no, "loc_no": 2, "qty": 1},
            ],
        }
        receive_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/receive",
            json=receive_payload,
        )
        assert receive_resp.status_code == 200
        received = receive_resp.get_json()
        assert received["received"] == 3
        assert received["can_receive"] is True
        locations = {
            (loc["box_no"], loc["loc_no"]): loc["qty"]
            for loc in received["part_locations"]
        }
        assert locations[(box.box_no, 1)] == 2
        assert locations[(box.box_no, 2)] == 1

    def test_receive_line_stock_endpoint_requires_ordered(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        box = container.box_service().create_box("API Pending Box", 3)
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        receive_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/receive",
            json={
                "receive_qty": 1,
                "allocations": [
                    {"box_no": box.box_no, "loc_no": 1, "qty": 1},
                ],
            },
        )
        assert receive_resp.status_code == 409

    def test_line_mutations_reject_done_list(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        part_service = container.part_service()
        shopping_list_service = container.shopping_list_service()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 2},
        )
        assert create_resp.status_code == 201
        line_id = create_resp.get_json()["id"]

        shopping_list_service.set_list_status(
            shopping_list_id,
            ShoppingListStatus.DONE,
        )
        session.commit()

        extra_part = part_service.create_part(description="Post completion component")
        session.commit()

        add_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": extra_part.id, "needed": 1},
        )
        assert add_resp.status_code == 409
        assert (
            add_resp.get_json()["error"]
            == "Cannot add part to shopping list because lines cannot be modified on a list that is marked done"
        )

        update_resp = client.put(
            f"/api/shopping-list-lines/{line_id}",
            json={"note": "Attempt update"},
        )
        assert update_resp.status_code == 409
        assert (
            update_resp.get_json()["error"]
            == "Cannot update shopping list line because lines cannot be modified on a list that is marked done"
        )

        delete_resp = client.delete(f"/api/shopping-list-lines/{line_id}")
        assert delete_resp.status_code == 409
        assert (
            delete_resp.get_json()["error"]
            == "Cannot delete shopping list line because lines cannot be modified on a list that is marked done"
        )

        fetch_resp = client.get(f"/api/shopping-lists/{shopping_list_id}/lines")
        assert fetch_resp.status_code == 200
        lines = fetch_resp.get_json()["lines"]
        assert len(lines) == 1
        assert lines[0]["id"] == line_id
        assert lines[0]["status"] == ShoppingListLineStatus.NEW.value

    def test_complete_line_endpoint_requires_mismatch_reason(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        box = container.box_service().create_box("API Mismatch Box", 2)
        seller = container.seller_service().create_seller(
            f"CL-{uuid.uuid4()}", "https://cl.example"
        )
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 3, "seller_id": seller.id},
        )
        line_id = create_resp.get_json()["id"]

        # Manually set to ORDERED
        stored_line = session.get(ShoppingListLine, line_id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 3
        session.flush()

        receive_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/receive",
            json={
                "receive_qty": 1,
                "allocations": [
                    {"box_no": box.box_no, "loc_no": 1, "qty": 1},
                ],
            },
        )
        assert receive_resp.status_code == 200

        complete_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/complete",
            json={},
        )
        assert complete_resp.status_code == 409

        with_reason = client.post(
            f"/api/shopping-list-lines/{line_id}/complete",
            json={"mismatch_reason": "Vendor short shipped"},
        )
        assert with_reason.status_code == 200
        payload = with_reason.get_json()
        assert payload["status"] == ShoppingListLineStatus.DONE.value
        assert payload["completion_mismatch"] is True
        assert payload["completion_note"] == "Vendor short shipped"
        assert payload["can_receive"] is False

    def test_complete_line_endpoint_success_when_totals_match(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        box = container.box_service().create_box("API Completion Box", 3)
        seller = container.seller_service().create_seller(
            f"CM-{uuid.uuid4()}", "https://cm.example"
        )
        session.commit()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 4, "seller_id": seller.id},
        )
        line_id = create_resp.get_json()["id"]

        # Manually set to ORDERED
        stored_line = session.get(ShoppingListLine, line_id)
        stored_line.status = ShoppingListLineStatus.ORDERED
        stored_line.ordered = 4
        session.flush()

        receive_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/receive",
            json={
                "receive_qty": 4,
                "allocations": [
                    {"box_no": box.box_no, "loc_no": 1, "qty": 4},
                ],
            },
        )
        assert receive_resp.status_code == 200

        complete_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/complete",
            json={},
        )
        assert complete_resp.status_code == 200
        payload = complete_resp.get_json()
        assert payload["status"] == ShoppingListLineStatus.DONE.value
        assert payload["completion_mismatch"] is False
        assert payload["completion_note"] is None
        assert payload["can_receive"] is False
