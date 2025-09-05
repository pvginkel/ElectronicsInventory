"""Test setup service functionality."""

import pytest
from flask import Flask
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import InvalidOperationException
from app.models.type import Type
from app.services.container import ServiceContainer
from app.services.setup_service import SetupService


class TestSetupService:
    """Test cases for SetupService functionality."""

    def test_sync_types_from_setup_success_empty_database(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test sync_types_from_setup with empty database adds all types."""
        service = container.setup_service()

        # Verify database is empty
        stmt = select(Type)
        existing_types = list(session.execute(stmt).scalars().all())
        assert len(existing_types) == 0

        # Run sync
        added_count = service.sync_types_from_setup()

        # Verify all 99 types were added
        assert added_count == 99

        # Verify types are in database
        stmt = select(Type).order_by(Type.name)
        all_types = list(session.execute(stmt).scalars().all())
        assert len(all_types) == 99

        # Check some specific types exist (exact names from types.txt)
        type_names = [t.name for t in all_types]
        assert "AC-DC Power Module" in type_names
        assert "Resistor" in type_names
        assert "Zener Diode" in type_names

    def test_sync_types_from_setup_success_with_existing_types(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test sync_types_from_setup with some existing types adds only missing ones."""
        service = container.setup_service()

        # Add a few types manually first (use actual names from types.txt)
        existing_type1 = Type(name="Resistor")
        existing_type2 = Type(name="Capacitor")
        session.add(existing_type1)
        session.add(existing_type2)
        session.flush()

        # Run sync
        added_count = service.sync_types_from_setup()

        # Verify only missing types were added (99 total - 2 existing = 97)
        assert added_count == 97

        # Verify total count is now 99
        stmt = select(Type)
        all_types = list(session.execute(stmt).scalars().all())
        assert len(all_types) == 99

    def test_sync_types_from_setup_idempotent(
        self, app: Flask, session: Session, container: ServiceContainer
    ):
        """Test that running sync multiple times is idempotent."""
        service = container.setup_service()

        # First run
        added_count1 = service.sync_types_from_setup()
        assert added_count1 == 99

        # Second run should add nothing
        added_count2 = service.sync_types_from_setup()
        assert added_count2 == 0

        # Third run should still add nothing
        added_count3 = service.sync_types_from_setup()
        assert added_count3 == 0

        # Total should still be 99
        stmt = select(Type)
        all_types = list(session.execute(stmt).scalars().all())
        assert len(all_types) == 99

    def test_sync_types_from_setup_file_not_found(
        self, app: Flask, session: Session, monkeypatch
    ):
        """Test sync_types_from_setup raises exception when types.txt not found."""
        service = SetupService(session)

        # Mock get_types_from_setup to raise InvalidOperationException
        def mock_get_types_from_setup():
            raise InvalidOperationException("parse lines from file", "File not found: /path/types.txt")

        monkeypatch.setattr("app.services.setup_service.get_types_from_setup", mock_get_types_from_setup)

        # Should raise InvalidOperationException
        with pytest.raises(InvalidOperationException) as exc_info:
            service.sync_types_from_setup()

        assert "File not found" in str(exc_info.value)

    def test_sync_types_from_setup_with_comments_and_empty_lines(
        self, app: Flask, session: Session, monkeypatch
    ):
        """Test that sync properly handles comments and empty lines in types.txt."""
        service = SetupService(session)

        # Mock get_types_from_setup to return a test list (simulating parsed file with comments/empty lines handled)
        def mock_get_types_from_setup():
            return ["Resistors", "Capacitors", "LEDs"]

        monkeypatch.setattr("app.services.setup_service.get_types_from_setup", mock_get_types_from_setup)

        # Run sync
        added_count = service.sync_types_from_setup()

        # Should add 3 types (Resistors, Capacitors, LEDs)
        assert added_count == 3

        # Verify the correct types were added
        stmt = select(Type.name).order_by(Type.name)
        type_names = list(session.execute(stmt).scalars().all())
        assert type_names == ["Capacitors", "LEDs", "Resistors"]
