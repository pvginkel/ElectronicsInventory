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
    *,
    part_key: str = "PK01",
    required_per_unit: int = 2,
    initial_qty: int = 6,
    requested_units: int = 1,
) -> tuple[Kit, Part, KitContent, Location]:
    kit = Kit(name="Pick List API Kit", build_target=1, status=KitStatus.ACTIVE)
    session.add(kit)
    session.flush()

    part = Part(key=part_key, description="API pick part")
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

    def test_create_pick_list_returns_detail(self, client, session) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, required_per_unit=2, initial_qty=10)

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

    def test_create_pick_list_insufficient_stock(self, client, session) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(
            session,
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

    def test_get_pick_list_detail(self, client, session) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, required_per_unit=1, initial_qty=5)
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

    def test_pick_line_endpoint_updates_inventory(self, client, session) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, required_per_unit=1, initial_qty=3)
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

    def test_undo_line_endpoint_reopens_line(self, client, session) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, required_per_unit=1, initial_qty=3)
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

    def test_list_pick_lists_for_kit_returns_summaries(self, client, session) -> None:
        kit, _, _, _ = _seed_kit_with_inventory(session, required_per_unit=1, initial_qty=6)
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
