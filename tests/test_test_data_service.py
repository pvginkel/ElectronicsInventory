"""Tests for test data service functionality."""

import json
import tempfile
from pathlib import Path

import pytest
from flask import Flask
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.models.box import Box
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.type import Type
from app.services.test_data_service import TestDataService


class TestTestDataService:
    """Test cases for TestDataService."""

    def test_load_types_success(self, app: Flask, session: Session):
        """Test successful loading of types from JSON."""
        with app.app_context():
            # Create temporary test data
            test_data = [
                {"name": "Resistor"},
                {"name": "Capacitor"},
                {"name": "IC"}
            ]
            
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                types_file = data_dir / "types.json"
                
                with types_file.open("w") as f:
                    json.dump(test_data, f)
                
                # Load types
                types_map = TestDataService.load_types(session, data_dir)
                
                # Verify results
                assert len(types_map) == 3
                assert "Resistor" in types_map
                assert "Capacitor" in types_map
                assert "IC" in types_map
                
                # Verify database records
                all_types = session.query(Type).all()
                assert len(all_types) == 3
                type_names = {t.name for t in all_types}
                assert type_names == {"Resistor", "Capacitor", "IC"}

    def test_load_types_file_not_found(self, app: Flask, session: Session):
        """Test error handling when types.json doesn't exist."""
        with app.app_context():
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                
                with pytest.raises(InvalidOperationException) as exc_info:
                    TestDataService.load_types(session, data_dir)
                
                assert "failed to read" in str(exc_info.value)

    def test_load_types_invalid_json(self, app: Flask, session: Session):
        """Test error handling with malformed JSON."""
        with app.app_context():
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                types_file = data_dir / "types.json"
                
                # Write invalid JSON
                with types_file.open("w") as f:
                    f.write("{invalid json")
                
                with pytest.raises(InvalidOperationException) as exc_info:
                    TestDataService.load_types(session, data_dir)
                
                assert "failed to read" in str(exc_info.value)

    def test_load_boxes_success(self, app: Flask, session: Session):
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
                boxes_map = TestDataService.load_boxes(session, data_dir)
                
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

    def test_load_parts_success(self, app: Flask, session: Session):
        """Test successful loading of parts with type relationships."""
        with app.app_context():
            # First create a type
            resistor_type = Type(name="Resistor")
            session.add(resistor_type)
            session.flush()
            
            types_map = {"Resistor": resistor_type}
            
            test_data = [
                {
                    "id4": "ABCD",
                    "manufacturer_code": "10k",
                    "description": "10kΩ resistor",
                    "type": "Resistor",
                    "tags": ["10k", "1/4W"],
                    "seller": "Digi-Key",
                    "seller_link": "https://example.com"
                },
                {
                    "id4": "EFGH",
                    "manufacturer_code": "LM358",
                    "description": "Op-amp",
                    "type": "Resistor",  # Using existing type for simplicity
                    "tags": ["Op-Amp"]
                }
            ]
            
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                parts_file = data_dir / "parts.json"
                
                with parts_file.open("w") as f:
                    json.dump(test_data, f)
                
                # Load parts
                parts_map = TestDataService.load_parts(session, data_dir, types_map)
                
                # Verify results
                assert len(parts_map) == 2
                assert "ABCD" in parts_map
                assert "EFGH" in parts_map
                
                part_abcd = parts_map["ABCD"]
                assert part_abcd.manufacturer_code == "10k"
                assert part_abcd.description == "10kΩ resistor"
                assert part_abcd.type_id == resistor_type.id
                assert part_abcd.tags == ["10k", "1/4W"]
                assert part_abcd.seller == "Digi-Key"
                assert part_abcd.seller_link == "https://example.com"

    def test_load_parts_without_type(self, app: Flask, session: Session):
        """Test loading parts without type assignment."""
        with app.app_context():
            types_map = {}
            
            test_data = [
                {
                    "id4": "ABCD",
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
                parts_map = TestDataService.load_parts(session, data_dir, types_map)
                
                # Verify results
                assert len(parts_map) == 1
                part = parts_map["ABCD"]
                assert part.type_id is None
                assert part.description == "Unknown part"

    def test_load_part_locations_success(self, app: Flask, session: Session):
        """Test successful loading of part location assignments."""
        with app.app_context():
            # Create test data
            box = Box(box_no=1, description="Test Box", capacity=10)
            session.add(box)
            session.flush()
            
            location = Location(box_no=1, loc_no=1, box_id=box.id)
            session.add(location)
            session.flush()
            
            part = Part(id4="ABCD", description="Test Part")
            session.add(part)
            session.flush()
            
            parts_map = {"ABCD": part}
            boxes_map = {1: box}
            
            test_data = [
                {"part_id4": "ABCD", "box_no": 1, "loc_no": 1, "qty": 50}
            ]
            
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                locations_file = data_dir / "part_locations.json"
                
                with locations_file.open("w") as f:
                    json.dump(test_data, f)
                
                # Load part locations
                TestDataService.load_part_locations(session, data_dir, parts_map, boxes_map)
                
                # Verify results
                part_locations = session.query(PartLocation).all()
                assert len(part_locations) == 1
                
                pl = part_locations[0]
                assert pl.part_id4 == "ABCD"
                assert pl.box_no == 1
                assert pl.loc_no == 1
                assert pl.qty == 50
                assert pl.location_id == location.id

    def test_load_part_locations_location_not_found(self, app: Flask, session: Session):
        """Test error handling when location doesn't exist."""
        with app.app_context():
            parts_map = {}
            boxes_map = {}
            
            test_data = [
                {"part_id4": "ABCD", "box_no": 1, "loc_no": 1, "qty": 50}
            ]
            
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                locations_file = data_dir / "part_locations.json"
                
                with locations_file.open("w") as f:
                    json.dump(test_data, f)
                
                with pytest.raises(InvalidOperationException) as exc_info:
                    TestDataService.load_part_locations(session, data_dir, parts_map, boxes_map)
                
                assert "location 1-1 not found" in str(exc_info.value)

    def test_load_quantity_history_success(self, app: Flask, session: Session):
        """Test successful loading of quantity history."""
        with app.app_context():
            # Create test part
            part = Part(id4="ABCD", description="Test Part")
            session.add(part)
            session.flush()
            
            parts_map = {"ABCD": part}
            
            test_data = [
                {
                    "part_id4": "ABCD",
                    "delta_qty": 100,
                    "location_reference": "1-1",
                    "timestamp": "2024-01-15T10:30:00"
                },
                {
                    "part_id4": "ABCD",
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
                TestDataService.load_quantity_history(session, data_dir, parts_map)
                
                # Verify results
                history_records = session.query(QuantityHistory).all()
                assert len(history_records) == 2
                
                # Check first record
                record1 = history_records[0]
                assert record1.part_id4 == "ABCD"
                assert record1.delta_qty == 100
                assert record1.location_reference == "1-1"
                
                # Check second record
                record2 = history_records[1]
                assert record2.part_id4 == "ABCD"
                assert record2.delta_qty == -25

    def test_load_quantity_history_invalid_timestamp(self, app: Flask, session: Session):
        """Test error handling with invalid timestamp format."""
        with app.app_context():
            parts_map = {}
            
            test_data = [
                {
                    "part_id4": "ABCD",
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
                    TestDataService.load_quantity_history(session, data_dir, parts_map)
                
                assert "invalid timestamp format" in str(exc_info.value)

    def test_load_full_dataset_integration(self, app: Flask, session: Session):
        """Test loading complete dataset integration."""
        with app.app_context():
            # Create minimal test dataset
            types_data = [{"name": "Resistor"}]
            boxes_data = [{"box_no": 1, "description": "Test Box", "capacity": 5}]
            parts_data = [{
                "id4": "ABCD",
                "description": "Test resistor",
                "type": "Resistor"
            }]
            part_locations_data = [{"part_id4": "ABCD", "box_no": 1, "loc_no": 1, "qty": 10}]
            history_data = [{
                "part_id4": "ABCD",
                "delta_qty": 10,
                "location_reference": "1-1",
                "timestamp": "2024-01-01T00:00:00"
            }]
            
            with tempfile.TemporaryDirectory() as temp_dir:
                data_dir = Path(temp_dir)
                
                # Create all JSON files
                with (data_dir / "types.json").open("w") as f:
                    json.dump(types_data, f)
                with (data_dir / "boxes.json").open("w") as f:
                    json.dump(boxes_data, f)
                with (data_dir / "parts.json").open("w") as f:
                    json.dump(parts_data, f)
                with (data_dir / "part_locations.json").open("w") as f:
                    json.dump(part_locations_data, f)
                with (data_dir / "quantity_history.json").open("w") as f:
                    json.dump(history_data, f)
                
                # Temporarily replace the data directory path
                import app.services.test_data_service
                original_method = TestDataService.load_full_dataset
                
                def mock_load_full_dataset(db: Session) -> None:
                    types = TestDataService.load_types(db, data_dir)
                    boxes = TestDataService.load_boxes(db, data_dir)
                    parts = TestDataService.load_parts(db, data_dir, types)
                    TestDataService.load_part_locations(db, data_dir, parts, boxes)
                    TestDataService.load_quantity_history(db, data_dir, parts)
                    db.commit()
                
                TestDataService.load_full_dataset = staticmethod(mock_load_full_dataset)
                
                try:
                    # Load full dataset
                    TestDataService.load_full_dataset(session)
                    
                    # Verify all data was loaded
                    assert session.query(Type).count() == 1
                    assert session.query(Box).count() == 1
                    assert session.query(Location).count() == 5  # box capacity
                    assert session.query(Part).count() == 1
                    assert session.query(PartLocation).count() == 1
                    assert session.query(QuantityHistory).count() == 1
                    
                    # Verify relationships
                    part = session.query(Part).first()
                    assert part.type is not None
                    assert part.type.name == "Resistor"
                    
                    part_location = session.query(PartLocation).first()
                    assert part_location.part_id4 == "ABCD"
                    assert part_location.qty == 10
                    
                finally:
                    # Restore original method
                    TestDataService.load_full_dataset = original_method