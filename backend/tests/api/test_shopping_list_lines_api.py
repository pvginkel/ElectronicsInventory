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
        assert created["effective_seller"] is None
        assert created["is_orderable"] is False
        assert created["is_revertible"] is False

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
        assert updated["effective_seller"]["id"] == seller.id
        assert updated["effective_seller_id"] == seller.id

        list_resp = client.get(f"/api/shopping-lists/{shopping_list_id}/lines")
        assert list_resp.status_code == 200
        lines_payload = list_resp.get_json()
        assert len(lines_payload["lines"]) == 1
        line_entry = lines_payload["lines"][0]
        assert line_entry["needed"] == 5
        assert line_entry["part_id"] == part_id
        assert "effective_seller_id" in line_entry

        delete_resp = client.delete(f"/api/shopping-list-lines/{line_id}")
        assert delete_resp.status_code == 204

        list_after_delete = client.get(f"/api/shopping-lists/{shopping_list_id}/lines")
        assert list_after_delete.status_code == 200
        assert list_after_delete.get_json()["lines"] == []

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

    def test_mark_line_ordered_and_revert_endpoint(self, client, session, container):
        shopping_list_id, part_id, _ = self._setup_list_and_part(container, session)
        shopping_list_service = container.shopping_list_service()

        create_resp = client.post(
            f"/api/shopping-lists/{shopping_list_id}/lines",
            json={"part_id": part_id, "needed": 4},
        )
        line_id = create_resp.get_json()["id"]

        shopping_list_service.set_list_status(
            shopping_list_id,
            ShoppingListStatus.READY,
        )
        session.commit()

        order_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/order",
            json={"ordered_qty": 4, "comment": "Rush order"},
        )
        assert order_resp.status_code == 200
        ordered_payload = order_resp.get_json()
        assert ordered_payload["status"] == ShoppingListLineStatus.ORDERED.value
        assert ordered_payload["ordered"] == 4
        assert ordered_payload["note"] == "Rush order"
        assert ordered_payload["is_revertible"] is True

        revert_resp = client.post(
            f"/api/shopping-list-lines/{line_id}/revert",
            json={"status": ShoppingListLineStatus.NEW.value},
        )
        assert revert_resp.status_code == 200
        reverted_payload = revert_resp.get_json()
        assert reverted_payload["status"] == ShoppingListLineStatus.NEW.value
        assert reverted_payload["ordered"] == 0

    def test_group_order_endpoint_updates_lines(self, client, session, container):
        shopping_list_service = container.shopping_list_service()
        shopping_list_line_service = container.shopping_list_line_service()
        part_service = container.part_service()
        seller_service = container.seller_service()

        seller = seller_service.create_seller("Bundle Seller", "https://bundle.example")
        part_default = part_service.create_part(description="Logic buffer", seller_id=seller.id)
        part_override = part_service.create_part(description="Harness kit")
        part_none = part_service.create_part(description="Cable tie")

        shopping_list = shopping_list_service.create_list("Group API")
        default_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_default.id,
            needed=3,
        )
        override_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_override.id,
            needed=6,
            seller_id=seller.id,
        )
        ungrouped_line = shopping_list_line_service.add_line(
            shopping_list.id,
            part_id=part_none.id,
            needed=5,
        )
        session.commit()

        shopping_list_service.set_list_status(
            shopping_list.id,
            ShoppingListStatus.READY,
        )
        session.commit()

        payload = {
            "lines": [
                {"line_id": default_line.id, "ordered_qty": 4},
                {"line_id": override_line.id, "ordered_qty": None},
            ]
        }
        order_resp = client.post(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/{seller.id}/order",
            json=payload,
        )
        assert order_resp.status_code == 200
        ordered_lines = order_resp.get_json()
        assert {line["id"] for line in ordered_lines} == {default_line.id, override_line.id}
        for line in ordered_lines:
            assert line["status"] == ShoppingListLineStatus.ORDERED.value

        default_api_line = next(line for line in ordered_lines if line["id"] == default_line.id)
        override_api_line = next(line for line in ordered_lines if line["id"] == override_line.id)
        assert default_api_line["ordered"] == 4
        assert override_api_line["ordered"] == 6

        ungrouped_payload = {
            "lines": [
                {"line_id": ungrouped_line.id, "ordered_qty": 2},
            ]
        }
        ungrouped_resp = client.post(
            f"/api/shopping-lists/{shopping_list.id}/seller-groups/ungrouped/order",
            json=ungrouped_payload,
        )
        assert ungrouped_resp.status_code == 200
        ungrouped_lines = ungrouped_resp.get_json()
        assert ungrouped_lines[0]["id"] == ungrouped_line.id
        assert ungrouped_lines[0]["ordered"] == 2
        assert ungrouped_lines[0]["status"] == ShoppingListLineStatus.ORDERED.value
