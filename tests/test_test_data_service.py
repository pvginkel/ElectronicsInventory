"""Tests for test data service functionality."""

import json
import tempfile
from datetime import datetime
from pathlib import Path

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.seller import Seller
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_seller_note import ShoppingListSellerNote
from app.models.type import Type
from app.services.container import ServiceContainer


class TestTestDataService:
    """Test cases for TestDataService."""

    def test_load_types_success(self, app: Flask, session: Session, container: ServiceContainer):
        """Test successful loading of types from database (assumes types already loaded)."""
        with app.app_context():
            # First, create some types in the database (simulating what SetupService does)
            test_types = ["Resistor", "Capacitor", "Logic IC (74xx/4000)"]
            for type_name in test_types:
                type_obj = Type(name=type_name)
                session.add(type_obj)
            session.flush()

            # Load types from database
            data_dir = Path("/unused")  # Not used anymore
            types_map = container.test_data_service().load_types(data_dir)

            # Verify results - should return the existing types from database
            assert len(types_map) == 3
            assert "Resistor" in types_map
            assert "Capacitor" in types_map
            assert "Logic IC (74xx/4000)" in types_map

            # Verify all returned objects are from the database
            for type_obj in types_map.values():
                assert type_obj.id is not None  # Should have database IDs

    def test_load_types_no_types_in_database(self, app: Flask, session: Session, container: ServiceContainer):
        """Test error handling when no types exist in database."""
        with app.app_context():
            # Don't create any types in the database
            data_dir = Path("/unused")

            with pytest.raises(InvalidOperationException) as exc_info:
                container.test_data_service().load_types(data_dir)

            assert "No types found in database" in str(exc_info.value)

    def test_load_types_returns_database_objects(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that load_types returns proper database objects with IDs."""
        with app.app_context():
            # Create types in database with known IDs
            resistor_type = Type(name="Resistor")
            capacitor_type = Type(name="Capacitor")
            session.add(resistor_type)
            session.add(capacitor_type)
            session.flush()  # Get IDs

            types_map = container.test_data_service().load_types(Path("/unused"))

            # Verify we get the same objects back
            assert len(types_map) == 2
            assert types_map["Resistor"].id == resistor_type.id
            assert types_map["Capacitor"].id == capacitor_type.id

    def test_load_boxes_success(self, app: Flask, session: Session, container: ServiceContainer):
        """Test successful loading of boxes and locations."""
        with app.app_context():
            test_data = [
                {"box_no": 1, "description": "Small Parts", "capacity": 10},
                {"box_no": 2, "description": "Large Parts", "capacity": 20}
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                boxes_file = data_dir / "boxes.json"

                with boxes_file.open("w") as f:
                    json.dump(test_data, f)

                # Load boxes
                boxes_map = container.test_data_service().load_boxes(data_dir)

                # Verify results
                assert len(boxes_map) == 2
                assert 1 in boxes_map
                assert 2 in boxes_map
                assert boxes_map[1].description == "Small Parts"
                assert boxes_map[2].description == "Large Parts"

                # Verify locations were created
                locations = session.query(Location).all()
                assert len(locations) == 30  # 10 + 20 locations total

                # Verify specific locations exist
                box1_locations = session.query(Location).filter_by(box_no=1).all()
                assert len(box1_locations) == 10
                box2_locations = session.query(Location).filter_by(box_no=2).all()
                assert len(box2_locations) == 20

    def test_load_parts_success(self, app: Flask, session: Session, container: ServiceContainer):
        """Test successful loading of parts with type relationships."""
        with app.app_context():
            # First create a type
            resistor_type = Type(name="Resistor")
            session.add(resistor_type)
            session.flush()

            # Create test sellers
            from app.models.seller import Seller
            digikey_seller = Seller(name="Digi-Key", website="https://www.digikey.com")
            session.add(digikey_seller)
            session.flush()

            types_map = {"Resistor": resistor_type}
            sellers_map = {1: digikey_seller}

            test_data = [
                {
                    "key": "ABCD",
                    "manufacturer_code": "10k",
                    "description": "10kΩ resistor",
                    "type": "Resistor",
                    "tags": ["10k", "1/4W"],
                    "manufacturer": "Vishay",
                    "product_page": "https://www.vishay.com/resistors/",
                    "seller_id": 1,
                    "seller_link": "https://example.com"
                },
                {
                    "key": "EFGH",
                    "manufacturer_code": "LM358",
                    "description": "Op-amp",
                    "type": "Resistor",  # Using existing type for simplicity
                    "tags": ["Op-Amp"],
                    "manufacturer": "Texas Instruments",
                    "product_page": "https://www.ti.com/product/LM358"
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                parts_file = data_dir / "parts.json"

                with parts_file.open("w") as f:
                    json.dump(test_data, f)

                # Load parts
                parts_map = container.test_data_service().load_parts(data_dir, types_map, sellers_map)

                # Verify results
                assert len(parts_map) == 2
                assert "ABCD" in parts_map
                assert "EFGH" in parts_map

                part_abcd = parts_map["ABCD"]
                assert part_abcd.manufacturer_code == "10k"
                assert part_abcd.description == "10kΩ resistor"
                assert part_abcd.type_id == resistor_type.id
                assert part_abcd.tags == ["10k", "1/4W"]
                assert part_abcd.manufacturer == "Vishay"
                assert part_abcd.product_page == "https://www.vishay.com/resistors/"
                assert part_abcd.seller_id == digikey_seller.id
                assert part_abcd.seller.name == "Digi-Key"
                assert part_abcd.seller_link == "https://example.com"

                part_efgh = parts_map["EFGH"]
            assert part_efgh.manufacturer == "Texas Instruments"
            assert part_efgh.product_page == "https://www.ti.com/product/LM358"
            assert part_efgh.seller_id is None

    def test_load_shopping_list_seller_notes_success(self, app: Flask, session: Session, container: ServiceContainer):
        """Test loading of seller notes tied to shopping lists."""
        with app.app_context():
            shopping_list = ShoppingList(name="Ready Notes")
            seller = Seller(name="Fixture Seller", website="https://fixture.example")
            session.add_all([shopping_list, seller])
            session.flush()

            shopping_lists_map = {shopping_list.name: shopping_list}
            sellers_map = {1: seller}

            notes_data = [
                {
                    "shopping_list_name": shopping_list.name,
                    "seller_id": 1,
                    "note": "Bundle with capacitor restock."
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                notes_file = data_dir / "shopping_list_seller_notes.json"
                with notes_file.open("w") as f:
                    json.dump(notes_data, f)

                container.test_data_service().load_shopping_list_seller_notes(
                    data_dir,
                    shopping_lists_map,
                    sellers_map,
                )

            notes = session.query(ShoppingListSellerNote).all()
            assert len(notes) == 1
            assert notes[0].note == "Bundle with capacitor restock."
            assert notes[0].seller_id == seller.id

    def test_load_parts_invalid_type_reference(self, app: Flask, session: Session, container: ServiceContainer):
        """Test that loading parts with invalid type references raises an error."""
        with app.app_context():
            from app.models.seller import Seller
            from app.models.type import Type
            types_map: dict[str, Type] = {}  # Empty types map to force error
            sellers_map: dict[int, Seller] = {}  # Empty sellers map

            test_data = [
                {
                    "key": "ABCD",
                    "description": "Test part",
                    "type": "NonexistentType"  # This type doesn't exist
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                parts_file = data_dir / "parts.json"

                with parts_file.open("w") as f:
                    json.dump(test_data, f)

                # Should raise InvalidOperationException
                with pytest.raises(InvalidOperationException) as exc_info:
                    container.test_data_service().load_parts(data_dir, types_map, sellers_map)

                assert "unknown type 'NonexistentType' in part ABCD" in str(exc_info.value)

    def test_load_parts_without_type(self, app: Flask, session: Session, container: ServiceContainer):
        """Test loading parts without type assignment."""
        with app.app_context():
            from app.models.seller import Seller
            from app.models.type import Type
            types_map: dict[str, Type] = {}
            sellers_map: dict[int, Seller] = {}

            test_data = [
                {
                    "key": "ABCD",
                    "description": "Unknown part",
                    "manufacturer_code": "ABC123"
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                parts_file = data_dir / "parts.json"

                with parts_file.open("w") as f:
                    json.dump(test_data, f)

                # Load parts
                parts_map = container.test_data_service().load_parts(data_dir, types_map, sellers_map)

                # Verify results
                assert len(parts_map) == 1
                part = parts_map["ABCD"]
                assert part.type_id is None
                assert part.description == "Unknown part"

    def test_load_part_locations_success(self, app: Flask, session: Session, container: ServiceContainer, make_attachment_set):
        """Test successful loading of part location assignments."""
        with app.app_context():
            # Create test data
            box = Box(box_no=1, description="Test Box", capacity=10)
            session.add(box)
            session.flush()

            location = Location(box_no=1, loc_no=1, box_id=box.id)
            session.add(location)
            session.flush()

            attachment_set = make_attachment_set()
            part = Part(key="ABCD", description="Test Part", attachment_set_id=attachment_set.id)
            session.add(part)
            session.flush()

            parts_map = {"ABCD": part}
            boxes_map = {1: box}

            test_data = [
                {"part_key": "ABCD", "box_no": 1, "loc_no": 1, "qty": 50}
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                locations_file = data_dir / "part_locations.json"

                with locations_file.open("w") as f:
                    json.dump(test_data, f)

                # Load part locations
                container.test_data_service().load_part_locations(data_dir, parts_map, boxes_map)

                # Verify results
                part_locations = session.query(PartLocation).all()
                assert len(part_locations) == 1

                pl = part_locations[0]
                assert pl.part.key == "ABCD"
                assert pl.box_no == 1
                assert pl.loc_no == 1
                assert pl.qty == 50
                assert pl.location_id == location.id

    def test_load_part_locations_location_not_found(self, app: Flask, session: Session, container: ServiceContainer, make_attachment_set):
        """Test error handling when location doesn't exist."""
        with app.app_context():
            # Create a part but no corresponding location/box
            attachment_set = make_attachment_set()
            part = Part(key="ABCD", description="Test part", attachment_set_id=attachment_set.id)
            session.add(part)
            session.flush()

            parts_map = {"ABCD": part}
            from app.models.box import Box
            boxes_map: dict[int, Box] = {}  # Empty - no boxes created

            test_data = [
                {"part_key": "ABCD", "box_no": 1, "loc_no": 1, "qty": 50}
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                locations_file = data_dir / "part_locations.json"

                with locations_file.open("w") as f:
                    json.dump(test_data, f)

                with pytest.raises(InvalidOperationException) as exc_info:
                    container.test_data_service().load_part_locations(data_dir, parts_map, boxes_map)

                assert "location 1-1 not found" in str(exc_info.value)

    def test_load_quantity_history_success(self, app: Flask, session: Session, container: ServiceContainer, make_attachment_set):
        """Test successful loading of quantity history."""
        with app.app_context():
            # Create test part
            attachment_set = make_attachment_set()
            part = Part(key="ABCD", description="Test Part", attachment_set_id=attachment_set.id)
            session.add(part)
            session.flush()

            parts_map = {"ABCD": part}

            test_data = [
                {
                    "part_key": "ABCD",
                    "delta_qty": 100,
                    "location_reference": "1-1",
                    "timestamp": "2024-01-15T10:30:00"
                },
                {
                    "part_key": "ABCD",
                    "delta_qty": -25,
                    "location_reference": "1-1",
                    "timestamp": "2024-02-01T14:15:00"
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                history_file = data_dir / "quantity_history.json"

                with history_file.open("w") as f:
                    json.dump(test_data, f)

                # Load quantity history
                container.test_data_service().load_quantity_history(data_dir, parts_map)

                # Verify results
                history_records = session.query(QuantityHistory).all()
                assert len(history_records) == 2

                # Check first record
                record1 = history_records[0]
                assert record1.part.key == "ABCD"
                assert record1.delta_qty == 100
                assert record1.location_reference == "1-1"

                # Check second record
                record2 = history_records[1]
                assert record2.part.key == "ABCD"
                assert record2.delta_qty == -25

    def test_load_quantity_history_invalid_timestamp(self, app: Flask, session: Session, container: ServiceContainer):
        """Test error handling with invalid timestamp format."""
        with app.app_context():
            from app.models.part import Part
            parts_map: dict[str, Part] = {}

            test_data = [
                {
                    "part_key": "ABCD",
                    "delta_qty": 100,
                    "timestamp": "invalid-timestamp"
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                history_file = data_dir / "quantity_history.json"

                with history_file.open("w") as f:
                    json.dump(test_data, f)

                with pytest.raises(InvalidOperationException) as exc_info:
                    container.test_data_service().load_quantity_history(data_dir, parts_map)

                assert "invalid timestamp format" in str(exc_info.value)

    def test_load_kits_success(self, app: Flask, session: Session, container: ServiceContainer):
        """Kits loader should persist kits with archived timestamps."""
        with app.app_context():
            kits_data = [
                {
                    "name": "Integration Kit",
                    "description": "Kit for integration test",
                    "build_target": 2,
                    "status": "archived",
                    "archived_at": "2024-03-01T12:00:00",
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                with (data_dir / "kits.json").open("w") as f:
                    json.dump(kits_data, f)

                kits = container.test_data_service().load_kits(data_dir)

                assert "Integration Kit" in kits
                loaded = kits["Integration Kit"]
                assert loaded.status == KitStatus.ARCHIVED
                assert loaded.archived_at == datetime.fromisoformat("2024-03-01T12:00:00")

    def test_load_kit_contents_success(self, app: Flask, session: Session, container: ServiceContainer, make_attachment_set):
        """Kit contents loader should attach parts to kits."""
        with app.app_context():
            kit_attachment_set = make_attachment_set()
            part_attachment_set = make_attachment_set()
            kit = Kit(name="Content Kit", build_target=2, attachment_set_id=kit_attachment_set.id)
            part = Part(key="KC01", description="Content Part", attachment_set_id=part_attachment_set.id)
            session.add_all([kit, part])
            session.flush()

            kits_map = {kit.name: kit}
            parts_map = {part.key: part}

            kit_contents_data = [
                {
                    "kit": "Content Kit",
                    "part": "KC01",
                    "required_per_unit": 3,
                    "note": "Preload for tests",
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                with (data_dir / "kit_contents.json").open("w") as f:
                    json.dump(kit_contents_data, f)

                container.test_data_service().load_kit_contents(
                    data_dir,
                    kits_map,
                    parts_map,
                )

            contents = session.query(KitContent).all()
            assert len(contents) == 1
            row = contents[0]
            assert row.kit_id == kit.id
            assert row.part_id == part.id
            assert row.required_per_unit == 3
            assert row.note == "Preload for tests"

    def test_load_kits_invalid_status_raises(self, app: Flask, session: Session, container: ServiceContainer):
        """Invalid status values in kits data should raise errors."""
        with app.app_context():
            kits_data = [
                {
                    "name": "Bad Kit",
                    "status": "invalid",
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                with (data_dir / "kits.json").open("w") as f:
                    json.dump(kits_data, f)

                with pytest.raises(InvalidOperationException):
                    container.test_data_service().load_kits(data_dir)

    def test_load_kit_shopping_list_links_unknown_kit(self, app: Flask, session: Session, container: ServiceContainer):
        """Links referencing unknown kits should raise errors."""
        with app.app_context():
            shopping_list = ShoppingList(name="Linked List", status=ShoppingListStatus.CONCEPT)
            session.add(shopping_list)
            session.flush()

            links_data = [
                {
                    "kit_name": "Missing Kit",
                    "shopping_list_name": "Linked List",
                    "requested_units": 1,
                    "honor_reserved": False,
                    "snapshot_kit_updated_at": "2024-01-01T12:00:00",
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                with (data_dir / "kit_shopping_list_links.json").open("w") as f:
                    json.dump(links_data, f)

                kits_map: dict[str, Kit] = {}
                shopping_lists_map = {shopping_list.name: shopping_list}

                with pytest.raises(InvalidOperationException):
                    container.test_data_service().load_kit_shopping_list_links(
                        data_dir,
                        kits_map,
                        shopping_lists_map,
                    )

    def test_load_kit_pick_lists_invalid_status(self, app: Flask, session: Session, container: ServiceContainer, make_attachment_set):
        """Invalid pick list status values should raise errors."""
        with app.app_context():
            attachment_set = make_attachment_set()
            kit = Kit(name="Pick Status Kit", build_target=1, attachment_set_id=attachment_set.id)
            session.add(kit)
            session.flush()

            pick_lists_data = [
                {
                    "kit_name": "Pick Status Kit",
                    "requested_units": 1,
                    "status": "invalid",
                }
            ]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                with (data_dir / "kit_pick_lists.json").open("w") as f:
                    json.dump(pick_lists_data, f)

                kits_map = {kit.name: kit}

                with pytest.raises(InvalidOperationException):
                    container.test_data_service().load_kit_pick_lists(data_dir, kits_map)

    def test_load_full_dataset_integration(self, app: Flask, session: Session, container: ServiceContainer):
        """Test loading complete dataset integration."""
        with app.app_context():
            # First create a Resistor type in database (simulating what SetupService does)
            resistor_type = Type(name="Resistor")
            session.add(resistor_type)
            session.flush()

            # Create minimal test dataset
            sellers_data = [{"id": 1, "name": "Test Seller", "website": "https://example.com"}]
            boxes_data = [{"box_no": 1, "description": "Test Box", "capacity": 5}]
            parts_data = [
                {
                    "key": "ABCD",
                    "description": "Test resistor",
                    "type": "Resistor",  # This type exists in database
                }
            ]
            kits_data = [
                {
                    "name": "Integration Kit",
                    "description": "Integration test kit",
                    "build_target": 2,
                    "status": "active",
                }
            ]
            kit_contents_data = [
                {
                    "kit": "Integration Kit",
                    "part": "ABCD",
                    "required_per_unit": 2,
                    "note": "Integration note",
                }
            ]
            part_locations_data = [{"part_key": "ABCD", "box_no": 1, "loc_no": 1, "qty": 10}]
            history_data = [{
                "part_key": "ABCD",
                "delta_qty": 10,
                "location_reference": "1-1",
                "timestamp": "2024-01-01T00:00:00"
            }]

            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)

                # Create JSON files (sellers.json now required)
                with (data_dir / "sellers.json").open("w") as f:
                    json.dump(sellers_data, f)
                with (data_dir / "boxes.json").open("w") as f:
                    json.dump(boxes_data, f)
                with (data_dir / "parts.json").open("w") as f:
                    json.dump(parts_data, f)
                with (data_dir / "kits.json").open("w") as f:
                    json.dump(kits_data, f)
                with (data_dir / "kit_contents.json").open("w") as f:
                    json.dump(kit_contents_data, f)
                with (data_dir / "part_locations.json").open("w") as f:
                    json.dump(part_locations_data, f)
                with (data_dir / "quantity_history.json").open("w") as f:
                    json.dump(history_data, f)

                # Load full dataset using container
                service = container.test_data_service()
                types = service.load_types(data_dir)  # Loads existing types from database
                sellers = service.load_sellers(data_dir)
                boxes = service.load_boxes(data_dir)
                parts = service.load_parts(data_dir, types, sellers)
                kits = service.load_kits(data_dir)
                service.load_kit_contents(data_dir, kits, parts)
                service.load_part_locations(data_dir, parts, boxes)
                service.load_quantity_history(data_dir, parts)
                session.commit()

                # Verify all data was loaded
                from app.models.seller import Seller
                assert session.query(Type).count() == 1  # Just the one type we created
                assert session.query(Seller).count() == 1  # The seller we created
                assert session.query(Box).count() == 1
                assert session.query(Location).count() == 5  # box capacity
                assert session.query(Part).count() == 1
                assert session.query(PartLocation).count() == 1
                assert session.query(QuantityHistory).count() == 1
                assert session.query(Kit).count() == 1
                assert session.query(KitContent).count() == 1

                # Verify relationships
                part = session.query(Part).first()
                assert part is not None
                assert part.type is not None
                assert part.type.name == "Resistor"

                part_location = session.query(PartLocation).first()
                assert part_location is not None
                assert part_location.part.key == "ABCD"
                assert part_location.qty == 10
