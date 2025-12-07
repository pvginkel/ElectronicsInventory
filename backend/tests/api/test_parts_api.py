"""Tests for parts API endpoints covering kit usage navigation."""

from datetime import UTC, datetime

from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.seller import Seller
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus


class TestPartsApi:
    """API tests for part detail usage flags and kit listings."""

    def test_get_part_sets_used_in_kits_flag(self, client, session):
        part = Part(key="SW01", description="Toggle switch")
        kit = Kit(name="Synth Panel", build_target=3, status=KitStatus.ACTIVE)
        session.add_all([part, kit])
        session.flush()
        session.add(KitContent(kit=kit, part=part, required_per_unit=2))
        session.commit()

        response = client.get(f"/api/parts/{part.key}")
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["key"] == part.key
        assert payload["used_in_kits"] is True

    def test_get_part_used_in_kits_false_without_reservations(self, client, session):
        part = Part(key="SW02", description="Unused switch")
        session.add(part)
        session.commit()

        response = client.get(f"/api/parts/{part.key}")
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["used_in_kits"] is False

    def test_list_part_kits_returns_usage_and_records_metrics(self, client, session, container):
        part = Part(key="IO12", description="I/O expander")
        unused = Part(key="IO13", description="Unassigned expander")
        active_kit = Kit(name="Control Surface", build_target=4, status=KitStatus.ACTIVE)
        archived_kit = Kit(
            name="Legacy Surface",
            build_target=5,
            status=KitStatus.ARCHIVED,
            archived_at=datetime.now(UTC),
        )
        session.add_all([part, unused, active_kit, archived_kit])
        session.flush()
        session.add_all(
            [
                KitContent(kit=active_kit, part=part, required_per_unit=3),
                KitContent(kit=archived_kit, part=part, required_per_unit=6),
            ]
        )
        session.commit()

        metrics_service = container.metrics_service()

        usage_response = client.get(f"/api/parts/{part.key}/kits")
        assert usage_response.status_code == 200
        usage_payload = usage_response.get_json()
        assert len(usage_payload) == 1
        entry = usage_payload[0]
        assert entry["kit_id"] == active_kit.id
        assert entry["reserved_quantity"] == 12  # 3 required * build target 4
        assert entry["status"] == KitStatus.ACTIVE.value

        empty_response = client.get(f"/api/parts/{unused.key}/kits")
        assert empty_response.status_code == 200
        assert empty_response.get_json() == []

        # Validate metric labels
        true_metric = metrics_service.part_kit_usage_requests_total.labels(has_results="true")
        false_metric = metrics_service.part_kit_usage_requests_total.labels(has_results="false")
        assert true_metric._value.get() == 1
        assert false_metric._value.get() == 1

    def test_list_part_kits_missing_part_returns_404(self, client):
        response = client.get("/api/parts/ZZZZ/kits")
        assert response.status_code == 404


class TestPartsListIncludeParameter:
    """Tests for the consolidated parts list endpoint with include parameter."""

    def test_list_parts_without_include_returns_basic_data(self, client, session):
        """Verify that without include parameter, only basic part data is returned."""
        part = Part(key="R001", description="100 ohm resistor", type_id=1)
        session.add(part)
        session.commit()

        response = client.get("/api/parts")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 1
        assert payload[0]["key"] == "R001"
        assert payload[0]["description"] == "100 ohm resistor"
        # Optional fields should be absent or null
        assert payload[0].get("locations") is None
        assert payload[0].get("kits") is None
        assert payload[0].get("shopping_lists") is None
        assert payload[0].get("cover_url") is None

    def test_list_parts_include_locations(self, client, session):
        """Verify include=locations adds location data."""
        # Create box and locations
        box = Box(box_no=1, description="Test Box", capacity=10)
        session.add(box)
        session.flush()

        locations = [Location(box_id=box.id, box_no=1, loc_no=i) for i in range(1, 4)]
        session.add_all(locations)
        session.flush()

        # Create part with locations
        part = Part(key="C001", description="10uF capacitor", type_id=1)
        session.add(part)
        session.flush()

        part_locs = [
            PartLocation(part_id=part.id, box_no=1, loc_no=1, location_id=locations[0].id, qty=50),
            PartLocation(part_id=part.id, box_no=1, loc_no=2, location_id=locations[1].id, qty=30),
        ]
        session.add_all(part_locs)
        session.commit()

        response = client.get("/api/parts?include=locations")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 1
        assert payload[0]["key"] == "C001"
        assert payload[0]["total_quantity"] == 80
        assert len(payload[0]["locations"]) == 2
        assert payload[0]["locations"][0]["box_no"] == 1
        assert payload[0]["locations"][0]["loc_no"] == 1
        assert payload[0]["locations"][0]["qty"] == 50

    def test_list_parts_include_kits(self, client, session):
        """Verify include=kits adds kit membership data."""
        part = Part(key="IC01", description="ATmega328P", type_id=1)
        kit = Kit(name="Arduino Clone", build_target=5, status=KitStatus.ACTIVE)
        session.add_all([part, kit])
        session.flush()
        session.add(KitContent(kit=kit, part=part, required_per_unit=1))
        session.commit()

        response = client.get("/api/parts?include=kits")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 1
        assert payload[0]["key"] == "IC01"
        assert len(payload[0]["kits"]) == 1
        assert payload[0]["kits"][0]["kit_name"] == "Arduino Clone"
        assert payload[0]["kits"][0]["reserved_quantity"] == 5
        assert payload[0]["kits"][0]["status"] == KitStatus.ACTIVE.value

    def test_list_parts_include_shopping_lists(self, client, session):
        """Verify include=shopping_lists adds shopping list membership data."""
        part = Part(key="LED1", description="Red LED", type_id=1)
        seller = Seller(name="DigiKey", website="digikey.com")
        shopping_list = ShoppingList(name="Q1 Order", status=ShoppingListStatus.CONCEPT)
        session.add_all([part, seller, shopping_list])
        session.flush()

        line = ShoppingListLine(
            shopping_list_id=shopping_list.id,
            part_id=part.id,
            needed=100,
            seller_id=seller.id,
            status=ShoppingListLineStatus.NEW,
        )
        session.add(line)
        session.commit()

        response = client.get("/api/parts?include=shopping_lists")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 1
        assert payload[0]["key"] == "LED1"
        assert len(payload[0]["shopping_lists"]) == 1
        assert payload[0]["shopping_lists"][0]["shopping_list_name"] == "Q1 Order"
        assert payload[0]["shopping_lists"][0]["needed"] == 100
        assert payload[0]["shopping_lists"][0]["seller"]["name"] == "DigiKey"

    def test_list_parts_include_cover(self, client, session):
        """Verify include=cover adds cover URLs when attachment exists."""
        # Part with cover attachment
        part_with_cover = Part(key="SW10", description="Button with cover", type_id=1, cover_attachment_id=42)
        # Part without cover
        part_no_cover = Part(key="SW11", description="Button without cover", type_id=1)
        session.add_all([part_with_cover, part_no_cover])
        session.commit()

        response = client.get("/api/parts?include=cover")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 2

        # Find part with cover
        part_data = next(p for p in payload if p["key"] == "SW10")
        assert part_data["cover_url"] == "/api/attachments/42"
        assert part_data["cover_thumbnail_url"] == "/api/attachments/42/thumbnail"

        # Part without cover should not have URLs
        part_no_cover_data = next(p for p in payload if p["key"] == "SW11")
        assert part_no_cover_data.get("cover_url") is None
        assert part_no_cover_data.get("cover_thumbnail_url") is None

    def test_list_parts_include_all(self, client, session):
        """Verify include=locations,kits,shopping_lists,cover includes all optional data."""
        # Setup complete data
        box = Box(box_no=1, description="Full Test Box", capacity=10)
        session.add(box)
        session.flush()

        loc = Location(box_id=box.id, box_no=1, loc_no=1)
        session.add(loc)
        session.flush()

        part = Part(key="FULL", description="Fully loaded part", type_id=1, cover_attachment_id=99)
        kit = Kit(name="Test Kit", build_target=2, status=KitStatus.ACTIVE)
        shopping_list = ShoppingList(name="Test List", status=ShoppingListStatus.CONCEPT)
        session.add_all([part, kit, shopping_list])
        session.flush()

        part_loc = PartLocation(part_id=part.id, box_no=1, loc_no=1, location_id=loc.id, qty=10)
        kit_content = KitContent(kit=kit, part=part, required_per_unit=3)
        line = ShoppingListLine(
            shopping_list_id=shopping_list.id,
            part_id=part.id,
            needed=20,
            status=ShoppingListLineStatus.NEW,
        )
        session.add_all([part_loc, kit_content, line])
        session.commit()

        response = client.get("/api/parts?include=locations,kits,shopping_lists,cover")
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload) == 1

        part_data = payload[0]
        assert part_data["key"] == "FULL"
        assert len(part_data["locations"]) == 1
        assert len(part_data["kits"]) == 1
        assert len(part_data["shopping_lists"]) == 1
        assert part_data["cover_url"] == "/api/attachments/99"

    def test_list_parts_invalid_include_value(self, client):
        """Verify invalid include values return 400."""
        response = client.get("/api/parts?include=invalid")
        assert response.status_code == 400
        error = response.get_json()
        assert "invalid include value" in error["details"]["message"]

    def test_list_parts_include_parameter_too_long(self, client):
        """Verify DoS protection rejects excessively long include parameters."""
        long_param = "a" * 201
        response = client.get(f"/api/parts?include={long_param}")
        assert response.status_code == 400
        error = response.get_json()
        assert "exceeds maximum length" in error["details"]["message"]

    def test_list_parts_include_parameter_too_many_tokens(self, client):
        """Verify DoS protection rejects too many include tokens."""
        many_tokens = ",".join(["locations"] * 11)
        response = client.get(f"/api/parts?include={many_tokens}")
        assert response.status_code == 400
        error = response.get_json()
        assert "exceeds maximum" in error["details"]["message"]
