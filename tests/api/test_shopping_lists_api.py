"""API tests for shopping list endpoints."""

import uuid

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

        fetch_resp = client.get(f"/api/shopping-lists/{list_id}")
        assert fetch_resp.status_code == 200
        fetched = fetch_resp.get_json()
        assert fetched["name"] == name

        update_resp = client.put(
            f"/api/shopping-lists/{list_id}",
            json={"description": "Updated description"},
        )
        assert update_resp.status_code == 200
        assert update_resp.get_json()["description"] == "Updated description"

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
        names = {entry["name"] for entry in list_resp.get_json()}
        assert concept_list.name in names
        assert ready_list.name in names
        assert done_list.name not in names

        list_all_resp = client.get("/api/shopping-lists?include_done=true")
        assert list_all_resp.status_code == 200
        all_names = {entry["name"] for entry in list_all_resp.get_json()}
        assert done_list.name in all_names

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

        done_resp = client.put(
            f"/api/shopping-lists/{list_id}/status",
            json={"status": ShoppingListStatus.DONE.value},
        )
        assert done_resp.status_code == 200
        assert done_resp.get_json()["status"] == ShoppingListStatus.DONE.value
