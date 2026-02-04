"""API tests for pick list workflows."""

from __future__ import annotations

from sqlalchemy import select

from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list_line import KitPickListLine, PickListLineStatus
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation


def _seed_kit_with_inventory(
    session,
    make_attachment_set,
    *,
    part_key: str = "PK01",
    required_per_unit: int = 2,
    initial_qty: int = 6,
    requested_units: int = 1,
) -> tuple[Kit, Part, KitContent, Location]:
    kit_attachment_set = make_attachment_set()
    part_attachment_set = make_attachment_set()
    kit = Kit(name="Pick List API Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
    session.add(kit)
    session.flush()

    part = Part(key=part_key, description="API pick part", attachment_set_id=part_attachment_set.id)
    session.add(part)
    session.flush()

    content = KitContent(kit=kit, part=part, required_per_unit=required_per_unit)
    session.add(content)
    session.flush()

    box = Box(box_no=200, description="API Box", capacity=10)
    session.add(box)
    session.flush()

    location = Location(box_id=box.id, box_no=box.box_no, loc_no=1)
    session.add(location)
    session.flush()

    assignment = PartLocation(
        part_id=part.id,
        box_no=box.box_no,
        loc_no=location.loc_no,
        location_id=location.id,
        qty=initial_qty,
    )
    session.add(assignment)
    session.commit()

    return kit, part, content, location


class TestPickListsApi:
    """Integration tests for pick list REST endpoints."""

    def test_create_pick_list_returns_detail(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=2, initial_qty=10)

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 2},
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["kit_id"] == kit.id
        assert data["requested_units"] == 2
        assert data["status"] == "open"
        assert data["line_count"] >= 1
        assert all(line["status"] == "open" for line in data["lines"])

    def test_create_pick_list_insufficient_stock(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            required_per_unit=5,
            initial_qty=2,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )

        assert response.status_code == 409
        payload = response.get_json()
        assert "insufficient stock" in payload["error"].lower()

    def test_get_pick_list_detail(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=5)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 2},
        )
        pick_list_id = creation.get_json()["id"]

        response = client.get(f"/api/pick-lists/{pick_list_id}")
        assert response.status_code == 200
        data = response.get_json()
        assert data["id"] == pick_list_id
        assert len(data["lines"]) >= 1

    def test_pick_line_endpoint_updates_inventory(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=3)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list = creation.get_json()
        line_id = pick_list["lines"][0]["id"]

        line_qty = pick_list["lines"][0]["quantity_to_pick"]
        initial_assignment = session.execute(
            select(PartLocation)
            .join(
                KitPickListLine,
                KitPickListLine.location_id == PartLocation.location_id,
            )
            .where(KitPickListLine.id == line_id)
        ).scalar_one()
        initial_qty = initial_assignment.qty

        response = client.post(f"/api/pick-lists/{pick_list['id']}/lines/{line_id}/pick")
        assert response.status_code == 200
        detail = response.get_json()
        assert detail["status"] == "completed"
        assert detail["lines"][0]["status"] == PickListLineStatus.COMPLETED.value

        session.expire_all()
        updated_assignment = session.execute(
            select(PartLocation).where(PartLocation.location_id == initial_assignment.location_id)
        ).scalar_one_or_none()
        if updated_assignment is None:
            assert line_qty == initial_qty
        else:
            assert updated_assignment.qty == initial_qty - line_qty

    def test_undo_line_endpoint_reopens_line(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=3)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list = creation.get_json()
        line_id = pick_list["lines"][0]["id"]

        assignment = session.execute(
            select(PartLocation)
            .join(
                KitPickListLine,
                KitPickListLine.location_id == PartLocation.location_id,
            )
            .where(KitPickListLine.id == line_id)
        ).scalar_one()
        initial_qty = assignment.qty

        client.post(f"/api/pick-lists/{pick_list['id']}/lines/{line_id}/pick")
        response = client.post(f"/api/pick-lists/{pick_list['id']}/lines/{line_id}/undo")

        assert response.status_code == 200
        detail = response.get_json()
        assert detail["status"] == "open"
        assert detail["lines"][0]["status"] == PickListLineStatus.OPEN.value

        session.expire_all()
        refreshed_assignment = session.execute(
            select(PartLocation).where(PartLocation.location_id == assignment.location_id)
        ).scalar_one()
        assert refreshed_assignment.qty == initial_qty

    def test_list_pick_lists_for_kit_returns_summaries(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=6)
        client.post(f"/api/kits/{kit.id}/pick-lists", json={"requested_units": 1})
        client.post(f"/api/kits/{kit.id}/pick-lists", json={"requested_units": 2})

        response = client.get(f"/api/kits/{kit.id}/pick-lists")
        assert response.status_code == 200
        data = response.get_json()
        assert len(data) == 2
        assert data[0]["requested_units"] >= data[1]["requested_units"]

    def test_pick_list_routes_handle_missing_pick_list(self, client) -> None:
        response = client.get("/api/pick-lists/9999")
        assert response.status_code == 404

    def test_delete_pick_list_returns_204(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=3)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_id = creation.get_json()["id"]

        response = client.delete(f"/api/pick-lists/{pick_list_id}")
        assert response.status_code == 204

        get_response = client.get(f"/api/pick-lists/{pick_list_id}")
        assert get_response.status_code == 404

    def test_delete_pick_list_nonexistent_returns_404(self, client) -> None:
        response = client.delete("/api/pick-lists/9999")
        assert response.status_code == 404
        payload = response.get_json()
        assert "error" in payload

    def test_delete_pick_list_removes_all_lines(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=5)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 2},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_ids = [line["id"] for line in pick_list_data["lines"]]

        response = client.delete(f"/api/pick-lists/{pick_list_id}")
        assert response.status_code == 204

        from app.models.kit_pick_list import KitPickList
        assert session.get(KitPickList, pick_list_id) is None
        for line_id in line_ids:
            assert session.execute(
                select(KitPickListLine).where(KitPickListLine.id == line_id)
            ).scalar_one_or_none() is None

    def test_delete_pick_list_completed_preserves_inventory_history(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=3)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        client.post(f"/api/pick-lists/{pick_list_id}/lines/{line_id}/pick")

        line = session.execute(
            select(KitPickListLine).where(KitPickListLine.id == line_id)
        ).scalar_one()
        inventory_change_id = line.inventory_change_id

        response = client.delete(f"/api/pick-lists/{pick_list_id}")
        assert response.status_code == 204

        from app.models.quantity_history import QuantityHistory
        history_record = session.get(QuantityHistory, inventory_change_id)
        assert history_record is not None

    def test_update_pick_list_line_quantity_updates_quantity(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=10, initial_qty=50)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={"quantity_to_pick": 5},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["id"] == pick_list_id
        updated_line = [line for line in data["lines"] if line["id"] == line_id][0]
        assert updated_line["quantity_to_pick"] == 5
        assert data["total_quantity_to_pick"] == 5
        assert data["remaining_quantity"] == 5

    def test_update_pick_list_line_quantity_allows_zero(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=5, initial_qty=20)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={"quantity_to_pick": 0},
        )

        assert response.status_code == 200
        data = response.get_json()
        updated_line = [line for line in data["lines"] if line["id"] == line_id][0]
        assert updated_line["quantity_to_pick"] == 0
        assert updated_line["status"] == "open"

    def test_update_pick_list_line_quantity_updates_timestamp(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=8, initial_qty=30)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={"quantity_to_pick": 3},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert "updated_at" in data
        assert data["updated_at"] is not None

    def test_update_pick_list_line_quantity_missing_field_returns_400(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=5, initial_qty=20)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={},
        )

        assert response.status_code == 400

    def test_update_pick_list_line_quantity_negative_returns_400(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=5, initial_qty=20)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={"quantity_to_pick": -1},
        )

        assert response.status_code == 400

    def test_update_pick_list_line_quantity_nonexistent_pick_list_returns_404(self, client) -> None:
        response = client.patch(
            "/api/pick-lists/9999/lines/1",
            json={"quantity_to_pick": 5},
        )

        assert response.status_code == 404

    def test_update_pick_list_line_quantity_nonexistent_line_returns_404(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=5, initial_qty=20)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_id = creation.get_json()["id"]

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/9999",
            json={"quantity_to_pick": 5},
        )

        assert response.status_code == 404

    def test_update_pick_list_line_quantity_completed_line_returns_409(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=2, initial_qty=10)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        client.post(f"/api/pick-lists/{pick_list_id}/lines/{line_id}/pick")

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={"quantity_to_pick": 5},
        )

        assert response.status_code == 409
        payload = response.get_json()
        assert "cannot edit completed pick list line" in payload["error"].lower()

    def test_update_pick_list_line_quantity_completed_pick_list_returns_409(self, client, session, make_attachment_set) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=3, initial_qty=15)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_data = creation.get_json()
        pick_list_id = pick_list_data["id"]
        line_id = pick_list_data["lines"][0]["id"]

        client.post(f"/api/pick-lists/{pick_list_id}/lines/{line_id}/pick")

        response = client.patch(
            f"/api/pick-lists/{pick_list_id}/lines/{line_id}",
            json={"quantity_to_pick": 5},
        )

        assert response.status_code == 409
        payload = response.get_json()
        assert "cannot edit" in payload["error"].lower()

    def test_get_pick_list_pdf_returns_pdf(self, client, session, make_attachment_set) -> None:
        """Test GET /pick-lists/{id}/pdf returns a valid PDF."""
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=2, initial_qty=10)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_id = creation.get_json()["id"]

        response = client.get(f"/api/pick-lists/{pick_list_id}/pdf")

        assert response.status_code == 200
        assert response.content_type == "application/pdf"
        assert response.data.startswith(b"%PDF-")  # PDF magic bytes

    def test_get_pick_list_pdf_includes_correct_headers(self, client, session, make_attachment_set) -> None:
        """Test PDF response has correct Content-Disposition and Cache-Control headers."""
        kit, _, _, _ = _seed_kit_with_inventory(session, make_attachment_set, required_per_unit=1, initial_qty=5)
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        pick_list_id = creation.get_json()["id"]

        response = client.get(f"/api/pick-lists/{pick_list_id}/pdf")

        assert response.status_code == 200
        assert "Content-Disposition" in response.headers
        assert f"pick_list_{pick_list_id}.pdf" in response.headers["Content-Disposition"]
        assert "inline" in response.headers["Content-Disposition"]
        assert response.headers.get("Cache-Control") == "no-cache"

    def test_get_pick_list_pdf_nonexistent_returns_404(self, client) -> None:
        """Test PDF endpoint returns 404 for non-existent pick list."""
        response = client.get("/api/pick-lists/9999/pdf")

        assert response.status_code == 404
        payload = response.get_json()
        assert "error" in payload

    def test_get_pick_list_pdf_with_multiple_boxes(self, client, session, make_attachment_set) -> None:
        """Test PDF generation with lines from multiple boxes."""
        # Create a more complex scenario with multiple boxes
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Multi-box Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
        session.add(kit)
        session.flush()

        # Create parts and boxes
        part1_attachment_set = make_attachment_set()
        part2_attachment_set = make_attachment_set()
        part1 = Part(key="AAA1", description="Part in box 1", attachment_set_id=part1_attachment_set.id)
        part2 = Part(key="BBB2", description="Part in box 2", attachment_set_id=part2_attachment_set.id)
        session.add_all([part1, part2])
        session.flush()

        # Create two boxes
        box1 = Box(box_no=100, description="Box 100", capacity=10)
        box2 = Box(box_no=200, description="Box 200", capacity=10)
        session.add_all([box1, box2])
        session.flush()

        # Create locations
        loc1 = Location(box_id=box1.id, box_no=100, loc_no=1)
        loc2 = Location(box_id=box2.id, box_no=200, loc_no=1)
        session.add_all([loc1, loc2])
        session.flush()

        # Add inventory
        pl1 = PartLocation(
            part_id=part1.id,
            box_no=100,
            loc_no=1,
            location_id=loc1.id,
            qty=10,
        )
        pl2 = PartLocation(
            part_id=part2.id,
            box_no=200,
            loc_no=1,
            location_id=loc2.id,
            qty=10,
        )
        session.add_all([pl1, pl2])
        session.flush()

        # Create kit contents
        content1 = KitContent(kit=kit, part=part1, required_per_unit=1)
        content2 = KitContent(kit=kit, part=part2, required_per_unit=1)
        session.add_all([content1, content2])
        session.commit()

        # Create pick list via API
        creation = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={"requested_units": 1},
        )
        assert creation.status_code == 201
        pick_list_id = creation.get_json()["id"]

        # Request PDF
        response = client.get(f"/api/pick-lists/{pick_list_id}/pdf")

        assert response.status_code == 200
        assert response.content_type == "application/pdf"
        assert len(response.data) > 0

    def test_get_pick_list_pdf_with_zero_lines(self, client, session, make_attachment_set) -> None:
        """Test PDF generation handles empty pick lists gracefully."""
        # Create a kit with content but no inventory
        kit_attachment_set = make_attachment_set()
        part_attachment_set = make_attachment_set()
        kit = Kit(name="Empty Pick List Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
        session.add(kit)
        session.flush()

        part = Part(key="NOQT", description="Part with no quantity", attachment_set_id=part_attachment_set.id)
        session.add(part)
        session.flush()

        content = KitContent(kit=kit, part=part, required_per_unit=1)
        session.add(content)
        session.commit()

        # Manually create an empty pick list
        from app.models.kit_pick_list import KitPickList, KitPickListStatus
        pick_list = KitPickList(
            kit_id=kit.id,
            requested_units=1,
            status=KitPickListStatus.OPEN,
        )
        session.add(pick_list)
        session.commit()

        # Refresh to load relationships
        session.refresh(pick_list)

        # Request PDF
        response = client.get(f"/api/pick-lists/{pick_list.id}/pdf")

        # Should still generate a valid PDF even with no lines
        assert response.status_code == 200
        assert response.content_type == "application/pdf"


class TestShortfallHandlingApi:
    """API tests for shortfall handling during pick list creation."""

    def test_create_pick_list_with_limit_action(self, client, session, make_attachment_set) -> None:
        """Limit action should create pick list with reduced quantity."""
        kit, part, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="LIMT",
            required_per_unit=10,
            initial_qty=6,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"LIMT": {"action": "limit"}},
            },
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["status"] == "open"
        assert len(data["lines"]) == 1
        # Limited to 6 instead of 10
        assert data["lines"][0]["quantity_to_pick"] == 6

    def test_create_pick_list_with_omit_action(self, client, session, make_attachment_set) -> None:
        """Omit action should exclude part from pick list."""
        # Create kit with two parts - one with shortfall
        kit_attachment_set = make_attachment_set()
        kit = Kit(name="Omit Test Kit", build_target=1, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
        session.add(kit)
        session.flush()

        part1_attachment_set = make_attachment_set()
        part1 = Part(key="OMIT", description="Part to omit", attachment_set_id=part1_attachment_set.id)
        session.add(part1)
        session.flush()

        part2_attachment_set = make_attachment_set()
        part2 = Part(key="KEEP", description="Part to keep", attachment_set_id=part2_attachment_set.id)
        session.add(part2)
        session.flush()

        content1 = KitContent(kit=kit, part=part1, required_per_unit=10)
        content2 = KitContent(kit=kit, part=part2, required_per_unit=2)
        session.add_all([content1, content2])
        session.flush()

        box = Box(box_no=500, description="Omit Test Box", capacity=10)
        session.add(box)
        session.flush()

        location = Location(box_id=box.id, box_no=box.box_no, loc_no=1)
        session.add(location)
        session.flush()

        # Part 1 has shortfall, Part 2 has enough
        pl1 = PartLocation(part_id=part1.id, box_no=box.box_no, loc_no=1, location_id=location.id, qty=3)
        pl2 = PartLocation(part_id=part2.id, box_no=box.box_no, loc_no=1, location_id=location.id, qty=10)
        session.add_all([pl1, pl2])
        session.commit()

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"OMIT": {"action": "omit"}},
            },
        )

        assert response.status_code == 201
        data = response.get_json()
        assert len(data["lines"]) == 1
        assert data["lines"][0]["kit_content"]["part_key"] == "KEEP"
        assert data["lines"][0]["quantity_to_pick"] == 2

    def test_create_pick_list_all_parts_omitted_returns_409(self, client, session, make_attachment_set) -> None:
        """Omitting all parts should return 409 conflict."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="OALL",
            required_per_unit=10,
            initial_qty=3,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"OALL": {"action": "omit"}},
            },
        )

        assert response.status_code == 409
        payload = response.get_json()
        assert "all parts would be omitted" in payload["error"].lower()

    def test_create_pick_list_invalid_action_returns_400(self, client, session, make_attachment_set) -> None:
        """Invalid action value should return 400 validation error."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="INVL",
            required_per_unit=5,
            initial_qty=3,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"INVL": {"action": "invalid"}},
            },
        )

        assert response.status_code == 400

    def test_create_pick_list_shortfall_handling_with_no_shortfall(self, client, session, make_attachment_set) -> None:
        """shortfall_handling with sufficient stock should use full quantity."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="SUFF",
            required_per_unit=5,
            initial_qty=20,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 2,
                "shortfall_handling": {"SUFF": {"action": "limit"}},
            },
        )

        assert response.status_code == 201
        data = response.get_json()
        # Should use full required quantity (5 * 2 = 10)
        assert data["total_quantity_to_pick"] == 10

    def test_create_pick_list_shortfall_handling_unknown_part_ignored(self, client, session, make_attachment_set) -> None:
        """Unknown part keys in shortfall_handling should be ignored."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="REAL",
            required_per_unit=3,
            initial_qty=10,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"FAKE": {"action": "omit"}},
            },
        )

        assert response.status_code == 201
        data = response.get_json()
        assert len(data["lines"]) == 1
        assert data["lines"][0]["quantity_to_pick"] == 3

    def test_create_pick_list_shortfall_handling_missing_returns_400(self, client, session, make_attachment_set) -> None:
        """Missing action field in shortfall_handling should return 400."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="MISS",
            required_per_unit=5,
            initial_qty=3,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"MISS": {}},
            },
        )

        assert response.status_code == 400

    def test_create_pick_list_with_reject_action_returns_409(self, client, session, make_attachment_set) -> None:
        """Explicit reject action with shortfall should return 409."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="REJE",
            required_per_unit=10,
            initial_qty=5,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists",
            json={
                "requested_units": 1,
                "shortfall_handling": {"REJE": {"action": "reject"}},
            },
        )

        assert response.status_code == 409
        payload = response.get_json()
        assert "insufficient stock" in payload["error"].lower()
        assert "REJE" in payload["error"]


class TestPreviewShortfallApi:
    """Tests for the pick list preview endpoint."""

    def test_preview_no_shortfall(self, client, session, make_attachment_set) -> None:
        """Preview returns empty list when all parts have sufficient stock."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="PRVN",
            required_per_unit=5,
            initial_qty=50,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists/preview",
            json={"requested_units": 2},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["parts_with_shortfall"] == []

    def test_preview_with_shortfall(self, client, session, make_attachment_set) -> None:
        """Preview returns parts with shortfall details."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="PRVS",
            required_per_unit=10,
            initial_qty=15,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists/preview",
            json={"requested_units": 2},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload["parts_with_shortfall"]) == 1
        part = payload["parts_with_shortfall"][0]
        assert part["part_key"] == "PRVS"
        assert part["required_quantity"] == 20
        assert part["usable_quantity"] == 15
        assert part["shortfall_amount"] == 5

    def test_preview_kit_not_found(self, client) -> None:
        """Preview returns 404 for non-existent kit."""
        response = client.post(
            "/api/kits/99999/pick-lists/preview",
            json={"requested_units": 1},
        )

        assert response.status_code == 404

    def test_preview_invalid_requested_units(self, client, session, make_attachment_set) -> None:
        """Preview returns 400 for invalid requested units."""
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
            make_attachment_set,
            part_key="PRVU",
            required_per_unit=5,
            initial_qty=50,
        )

        response = client.post(
            f"/api/kits/{kit.id}/pick-lists/preview",
            json={"requested_units": 0},
        )

        assert response.status_code == 400
