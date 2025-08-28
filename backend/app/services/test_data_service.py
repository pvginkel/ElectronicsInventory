"""Test data service for loading fixed test data from JSON files."""

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from app.exceptions import InvalidOperationException
from app.models.box import Box
from app.models.location import Location
from app.models.part import Part
from app.models.part_location import PartLocation
from app.models.quantity_history import QuantityHistory
from app.models.type import Type
from app.services.base import BaseService


class TestDataService(BaseService):
    """Service class for loading fixed test data from JSON files."""

    def load_full_dataset(self) -> None:
        """Load complete test dataset from JSON files in correct dependency order."""
        data_dir = Path(__file__).parent.parent / "data" / "test_data"

        # Load in dependency order
        types = self.load_types(data_dir)
        boxes = self.load_boxes(data_dir)
        parts = self.load_parts(data_dir, types)
        self.load_part_locations(data_dir, parts, boxes)
        self.load_quantity_history(data_dir, parts)

        # Commit all changes
        self.db.commit()

    def load_types(self, data_dir: Path) -> dict[str, Type]:
        """Load electronics part types from types.json."""
        types_file = data_dir / "types.json"
        try:
            with types_file.open() as f:
                types_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException("load types data", f"failed to read {types_file}: {e}") from e

        types_map = {}
        for type_data in types_data:
            type_obj = Type(name=type_data["name"])
            self.db.add(type_obj)
            self.db.flush()  # Get ID immediately
            types_map[type_data["name"]] = type_obj

        return types_map

    def load_boxes(self, data_dir: Path) -> dict[int, Box]:
        """Load boxes from boxes.json and generate all locations."""
        boxes_file = data_dir / "boxes.json"
        try:
            with boxes_file.open() as f:
                boxes_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException("load boxes data", f"failed to read {boxes_file}: {e}") from e

        boxes_map = {}
        for box_data in boxes_data:
            box = Box(
                box_no=box_data["box_no"],
                description=box_data["description"],
                capacity=box_data["capacity"]
            )
            self.db.add(box)
            self.db.flush()  # Get ID immediately

            # Generate all locations for this box
            for loc_no in range(1, box_data["capacity"] + 1):
                location = Location(
                    box_no=box_data["box_no"],
                    loc_no=loc_no,
                    box_id=box.id
                )
                self.db.add(location)

            boxes_map[box_data["box_no"]] = box

        return boxes_map

    def load_parts(self, data_dir: Path, types: dict[str, Type]) -> dict[str, Part]:
        """Load parts from parts.json with type relationships."""
        parts_file = data_dir / "parts.json"
        try:
            with parts_file.open() as f:
                parts_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException("load parts data", f"failed to read {parts_file}: {e}") from e

        parts_map = {}
        for part_data in parts_data:
            # Get type_id from types map
            type_id = None
            if part_data.get("type"):
                type_name = part_data["type"]
                type_obj = types.get(type_name)
                if type_obj:
                    type_id = type_obj.id
                else:
                    raise InvalidOperationException("load parts data", f"unknown type '{type_name}' in part {part_data['key']}")

            part = Part(
                key=part_data["key"],
                manufacturer_code=part_data.get("manufacturer_code"),
                type_id=type_id,
                description=part_data["description"],
                tags=part_data.get("tags"),
                seller=part_data.get("seller"),
                seller_link=part_data.get("seller_link")
            )
            self.db.add(part)
            self.db.flush()  # Get ID immediately
            parts_map[part_data["key"]] = part

        return parts_map

    def load_part_locations(self, data_dir: Path, parts: dict[str, Part], boxes: dict[int, Box]) -> None:
        """Load part location assignments from part_locations.json."""
        part_locations_file = data_dir / "part_locations.json"
        try:
            with part_locations_file.open() as f:
                part_locations_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException("load part locations data", f"failed to read {part_locations_file}: {e}") from e

        for location_data in part_locations_data:
            part_key = location_data["part_key"]
            box_no = location_data["box_no"]
            loc_no = location_data["loc_no"]
            qty = location_data["qty"]

            # Get the part to get its ID
            part = parts[part_key]
            if not part:
                raise InvalidOperationException("load part locations", f"part {part_key} not found")

            # Find the location_id
            stmt = select(Location).where(
                Location.box_no == box_no,
                Location.loc_no == loc_no
            )
            location = self.db.execute(stmt).scalar_one_or_none()
            if not location:
                raise InvalidOperationException("load part locations", f"location {box_no}-{loc_no} not found")

            part_location = PartLocation(
                part_id=part.id,
                box_no=box_no,
                loc_no=loc_no,
                location_id=location.id,
                qty=qty
            )
            self.db.add(part_location)

    def load_quantity_history(self, data_dir: Path, parts: dict[str, Part]) -> None:
        """Load historical quantity changes from quantity_history.json."""
        quantity_history_file = data_dir / "quantity_history.json"
        try:
            with quantity_history_file.open() as f:
                quantity_history_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException("load quantity history data", f"failed to read {quantity_history_file}: {e}") from e

        for history_data in quantity_history_data:
            try:
                # Parse timestamp string to datetime
                timestamp = datetime.fromisoformat(history_data["timestamp"])
            except ValueError as e:
                raise InvalidOperationException("load quantity history", f"invalid timestamp format: {e}") from e

            # Get the part to get its ID
            part_key = history_data["part_key"]
            part = parts[part_key]
            if not part:
                raise InvalidOperationException("load quantity history", f"part {part_key} not found")

            quantity_history = QuantityHistory(
                part_id=part.id,
                delta_qty=history_data["delta_qty"],
                location_reference=history_data.get("location_reference"),
                timestamp=timestamp
            )
            self.db.add(quantity_history)
