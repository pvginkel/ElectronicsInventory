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
from app.models.seller import Seller
from app.models.shopping_list import ShoppingList, ShoppingListStatus
from app.models.shopping_list_line import ShoppingListLine, ShoppingListLineStatus
from app.models.type import Type
from app.services.base import BaseService


class TestDataService(BaseService):
    """Service class for loading fixed test data from JSON files."""

    def load_full_dataset(self) -> None:
        """Load complete test dataset from JSON files in correct dependency order."""
        data_dir = Path(__file__).parent.parent / "data" / "test_data"

        # Load in dependency order
        types = self.load_types(data_dir)
        sellers = self.load_sellers(data_dir)
        boxes = self.load_boxes(data_dir)
        parts = self.load_parts(data_dir, types, sellers)
        shopping_lists = self.load_shopping_lists(data_dir)
        self.load_shopping_list_lines(data_dir, shopping_lists, parts, sellers)
        self.load_part_locations(data_dir, parts, boxes)
        self.load_quantity_history(data_dir, parts)

        # Commit all changes
        self.db.commit()

    def load_types(self, data_dir: Path) -> dict[str, Type]:
        """Load electronics part types from database (already loaded by setup sync)."""
        # Types are now loaded automatically during database upgrade via SetupService
        # So we just need to query the existing types from the database
        stmt = select(Type)
        existing_types = list(self.db.execute(stmt).scalars().all())

        # Return as dictionary mapping name to Type object
        types_map = {type_obj.name: type_obj for type_obj in existing_types}

        if not types_map:
            raise InvalidOperationException(
                "load types data",
                "No types found in database. Ensure database upgrade completed successfully."
            )

        return types_map

    def load_sellers(self, data_dir: Path) -> dict[int, Seller]:
        """Load sellers from sellers.json."""
        sellers_file = data_dir / "sellers.json"
        try:
            with sellers_file.open() as f:
                sellers_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException("load sellers data", f"failed to read {sellers_file}: {e}") from e

        sellers_map = {}
        for seller_data in sellers_data:
            seller = Seller(
                name=seller_data["name"],
                website=seller_data["website"]
            )
            self.db.add(seller)
            self.db.flush()  # Get ID immediately
            sellers_map[seller_data["id"]] = seller

        return sellers_map

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

    def load_parts(self, data_dir: Path, types: dict[str, Type], sellers: dict[int, Seller]) -> dict[str, Part]:
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

            # Get seller_id from sellers map
            seller_id = None
            if part_data.get("seller_id") is not None:
                seller_obj = sellers.get(part_data["seller_id"])
                if seller_obj:
                    seller_id = seller_obj.id
                else:
                    raise InvalidOperationException("load parts data", f"unknown seller_id '{part_data['seller_id']}' in part {part_data['key']}")

            part = Part(
                key=part_data["key"],
                manufacturer_code=part_data.get("manufacturer_code"),
                type_id=type_id,
                description=part_data["description"],
                tags=part_data.get("tags"),
                manufacturer=part_data.get("manufacturer"),
                product_page=part_data.get("product_page"),
                seller_id=seller_id,
                seller_link=part_data.get("seller_link"),
                package=part_data.get("package"),
                pin_count=part_data.get("pin_count"),
                pin_pitch=part_data.get("pin_pitch"),
                voltage_rating=part_data.get("voltage_rating"),
                input_voltage=part_data.get("input_voltage"),
                output_voltage=part_data.get("output_voltage"),
                mounting_type=part_data.get("mounting_type"),
                series=part_data.get("series"),
                dimensions=part_data.get("dimensions")
            )
            self.db.add(part)
            self.db.flush()  # Get ID immediately
            parts_map[part_data["key"]] = part

        return parts_map

    def load_shopping_lists(self, data_dir: Path) -> dict[str, ShoppingList]:
        """Load shopping lists from shopping_lists.json."""
        shopping_lists_file = data_dir / "shopping_lists.json"
        try:
            with shopping_lists_file.open() as f:
                shopping_lists_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            raise InvalidOperationException(
                "load shopping lists data",
                f"failed to read {shopping_lists_file}: {e}",
            ) from e

        shopping_lists_map: dict[str, ShoppingList] = {}
        for shopping_list_data in shopping_lists_data:
            raw_status = shopping_list_data.get("status", ShoppingListStatus.CONCEPT.value)
            try:
                status = ShoppingListStatus(raw_status)
            except ValueError as exc:
                raise InvalidOperationException(
                    "load shopping lists data",
                    f"invalid status '{raw_status}' for shopping list {shopping_list_data.get('name')}",
                ) from exc

            shopping_list = ShoppingList(
                name=shopping_list_data["name"],
                description=shopping_list_data.get("description"),
                status=status,
            )
            self.db.add(shopping_list)
            self.db.flush()
            shopping_lists_map[shopping_list.name] = shopping_list

        return shopping_lists_map

    def load_shopping_list_lines(
        self,
        data_dir: Path,
        shopping_lists: dict[str, ShoppingList],
        parts: dict[str, Part],
        sellers: dict[int, Seller],
    ) -> None:
        """Load shopping list lines from shopping_list_lines.json."""
        lines_file = data_dir / "shopping_list_lines.json"
        try:
            with lines_file.open() as f:
                lines_data = json.load(f)
        except FileNotFoundError:
            return
        except json.JSONDecodeError as e:
            raise InvalidOperationException(
                "load shopping list lines data",
                f"failed to parse {lines_file}: {e}",
            ) from e

        for line_data in lines_data:
            list_name = line_data["shopping_list_name"]
            shopping_list = shopping_lists.get(list_name)
            if shopping_list is None:
                raise InvalidOperationException(
                    "load shopping list lines data",
                    f"unknown shopping list '{list_name}'",
                )

            part_key = line_data["part_key"]
            part = parts.get(part_key)
            if part is None:
                raise InvalidOperationException(
                    "load shopping list lines data",
                    f"unknown part key '{part_key}'",
                )

            seller_id = None
            if line_data.get("seller_id") is not None:
                seller = sellers.get(line_data["seller_id"])
                if seller is None:
                    raise InvalidOperationException(
                        "load shopping list lines data",
                        f"unknown seller id '{line_data['seller_id']}'",
                    )
                seller_id = seller.id

            raw_status = line_data.get("status", ShoppingListLineStatus.NEW.value)
            try:
                status = ShoppingListLineStatus(raw_status)
            except ValueError as exc:
                raise InvalidOperationException(
                    "load shopping list lines data",
                    f"invalid status '{raw_status}' for line referencing {part_key}",
                ) from exc

            line = ShoppingListLine(
                shopping_list_id=shopping_list.id,
                part_id=part.id,
                seller_id=seller_id,
                needed=line_data["needed"],
                note=line_data.get("note"),
                status=status,
            )
            self.db.add(line)
            self.db.flush()

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
