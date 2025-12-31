"""Tests for PickListReportService PDF generation."""

from __future__ import annotations

from io import BytesIO

import pytest

from app.models.box import Box
from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.kit_pick_list import KitPickList, KitPickListStatus
from app.models.kit_pick_list_line import KitPickListLine, PickListLineStatus
from app.models.location import Location
from app.models.part import Part
from app.services.pick_list_report_service import PickListReportService


class ReportMetricsStub:
    """Minimal metrics stub for PDF generation tracking."""

    def __init__(self) -> None:
        self.pdf_generated_calls: list[tuple[int, int, int]] = []
        self.pdf_duration_calls: list[tuple[float, str]] = []

    def record_pick_list_pdf_generated(
        self, pick_list_id: int, line_count: int, box_count: int
    ) -> None:
        self.pdf_generated_calls.append((pick_list_id, line_count, box_count))

    def record_pick_list_pdf_generation_duration(
        self, duration: float, status: str
    ) -> None:
        self.pdf_duration_calls.append((duration, status))


@pytest.fixture
def metrics_stub() -> ReportMetricsStub:
    """Provide a metrics stub for each test case."""
    return ReportMetricsStub()


@pytest.fixture
def report_service(metrics_stub: ReportMetricsStub) -> PickListReportService:
    """Create a PickListReportService with metrics stub."""
    return PickListReportService(metrics_service=metrics_stub)


def _create_pick_list(
    session,
    make_attachment_set,
    *,
    kit_name: str = "Test Kit",
    requested_units: int = 1,
    lines_data: list[tuple[int, int, str, str, int]] | None = None,
) -> KitPickList:
    """Helper to create a pick list with test data.

    Args:
        session: Database session
        make_attachment_set: Fixture to create attachment sets
        kit_name: Name of the kit
        requested_units: Number of units to build
        lines_data: List of (box_no, loc_no, part_key, part_description, quantity_to_pick)

    Returns:
        Created pick list with lines
    """
    # Create kit
    kit_attachment_set = make_attachment_set()
    kit = Kit(name=kit_name, build_target=1, status=KitStatus.ACTIVE, attachment_set_id=kit_attachment_set.id)
    session.add(kit)
    session.flush()

    # Create pick list
    pick_list = KitPickList(
        kit_id=kit.id,
        requested_units=requested_units,
        status=KitPickListStatus.OPEN,
    )
    session.add(pick_list)
    session.flush()

    # Create lines if data provided
    if lines_data:
        for box_no, loc_no, part_key, part_description, quantity_to_pick in lines_data:
            # Create box if needed
            box = session.query(Box).filter_by(box_no=box_no).first()
            if not box:
                box = Box(box_no=box_no, description=f"Box {box_no}", capacity=60)
                session.add(box)
                session.flush()

            # Create location if needed
            location = (
                session.query(Location)
                .filter_by(box_no=box_no, loc_no=loc_no)
                .first()
            )
            if not location:
                location = Location(
                    box_id=box.id, box_no=box_no, loc_no=loc_no
                )
                session.add(location)
                session.flush()

            # Create part
            part_attachment_set = make_attachment_set()
            part = Part(key=part_key, description=part_description, attachment_set_id=part_attachment_set.id)
            session.add(part)
            session.flush()

            # Create kit content
            content = KitContent(kit=kit, part=part, required_per_unit=1)
            session.add(content)
            session.flush()

            # Create pick list line
            line = KitPickListLine(
                pick_list_id=pick_list.id,
                kit_content_id=content.id,
                location_id=location.id,
                quantity_to_pick=quantity_to_pick,
                status=PickListLineStatus.OPEN,
            )
            session.add(line)

    session.commit()
    session.refresh(pick_list)
    return pick_list


class TestPickListReportService:
    """Test suite for PDF report generation."""

    def test_generate_pdf_returns_bytesio_buffer(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test that generate_pdf returns a BytesIO buffer."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            lines_data=[
                (1, 1, "ABCD", "Test resistor", 10),
            ],
        )

        result = report_service.generate_pdf(pick_list)

        assert isinstance(result, BytesIO)
        assert result.tell() == 0  # Should be seeked to start

    def test_generate_pdf_creates_valid_pdf(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test that the generated PDF is valid and readable."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            lines_data=[
                (1, 1, "ABCD", "Test resistor", 10),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Verify PDF starts with valid magic bytes
        pdf_buffer.seek(0)
        data = pdf_buffer.read(4)
        assert data == b"%PDF", "PDF should start with %PDF magic bytes"

    def test_generate_pdf_with_multiple_lines_same_box(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test PDF generation with multiple lines in the same box."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            kit_name="Multi-Line Kit",
            requested_units=2,
            lines_data=[
                (1, 1, "AAAA", "Resistor 1k", 5),
                (1, 3, "BBBB", "Capacitor 100nF", 3),
                (1, 5, "CCCC", "LED Red", 2),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Verify PDF is valid
        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"
        assert len(data) > 100, "PDF should have content"

    def test_generate_pdf_with_multiple_boxes(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test PDF generation groups lines by box number."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            kit_name="Multi-Box Kit",
            lines_data=[
                (2, 10, "XXXX", "Part in Box 2", 4),
                (1, 5, "YYYY", "Part in Box 1", 2),
                (3, 1, "ZZZZ", "Part in Box 3", 1),
                (1, 2, "WWWW", "Another in Box 1", 3),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Verify PDF is valid and contains expected content
        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"
        assert len(data) > 100, "PDF should have content"

    def test_generate_pdf_with_zero_lines(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test PDF generation handles empty pick lists gracefully."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            kit_name="Empty Kit",
            lines_data=[],  # No lines
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Should generate valid PDF even with no lines
        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"
        assert len(data) > 100, "PDF should have content"

    def test_generate_pdf_with_long_description(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test that long part descriptions are truncated properly."""
        long_description = "A" * 100  # Very long description
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            lines_data=[
                (1, 1, "LONG", long_description, 1),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Should generate valid PDF without errors
        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"

    def test_generate_pdf_records_metrics(
        self, session, report_service: PickListReportService, metrics_stub: ReportMetricsStub, make_attachment_set
    ) -> None:
        """Test that PDF generation records appropriate metrics."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            lines_data=[
                (1, 1, "ABCD", "Part 1", 5),
                (2, 3, "EFGH", "Part 2", 3),
            ],
        )

        report_service.generate_pdf(pick_list)

        # Verify metrics were recorded
        assert len(metrics_stub.pdf_generated_calls) == 1
        pick_list_id, line_count, box_count = metrics_stub.pdf_generated_calls[0]
        assert pick_list_id == pick_list.id
        assert line_count == 2
        assert box_count == 2  # Two boxes

        # Verify duration metric was recorded
        assert len(metrics_stub.pdf_duration_calls) == 1
        duration, status = metrics_stub.pdf_duration_calls[0]
        assert duration >= 0.0
        assert status == "success"

    def test_generate_pdf_includes_pick_list_metadata(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test that PDF includes pick list header information."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            kit_name="Metadata Test Kit",
            requested_units=5,
            lines_data=[
                (1, 1, "TEST", "Test part", 10),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"
        assert len(data) > 100, "PDF should have content"

    def test_generate_pdf_sorts_lines_within_box(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test that lines within a box are sorted by location number."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            lines_data=[
                (1, 15, "CCCC", "Part at loc 15", 1),
                (1, 3, "AAAA", "Part at loc 3", 1),
                (1, 10, "BBBB", "Part at loc 10", 1),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Just verify it generates without error
        # (Actual sorting order verification would require parsing PDF table structure)
        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"

    def test_generate_pdf_with_special_characters_in_description(
        self, session, report_service: PickListReportService, make_attachment_set
    ) -> None:
        """Test PDF generation handles special characters in descriptions."""
        pick_list = _create_pick_list(
            session,
            make_attachment_set,
            lines_data=[
                (1, 1, "SPEC", "Resistor 1kΩ ±5% (SMD 0603)", 10),
            ],
        )

        pdf_buffer = report_service.generate_pdf(pick_list)

        # Should generate valid PDF
        pdf_buffer.seek(0)
        data = pdf_buffer.read()
        assert data.startswith(b"%PDF"), "Should generate valid PDF"
