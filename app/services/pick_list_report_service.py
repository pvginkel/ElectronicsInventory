"""Service for generating PDF reports for kit pick lists."""

from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from time import perf_counter
from typing import TYPE_CHECKING, Any

from reportlab.lib import colors  # type: ignore[import-untyped]
from reportlab.lib.pagesizes import letter  # type: ignore[import-untyped]
from reportlab.lib.styles import getSampleStyleSheet  # type: ignore[import-untyped]
from reportlab.lib.units import inch  # type: ignore[import-untyped]
from reportlab.platypus import (  # type: ignore[import-untyped]
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.metrics_service import MetricsServiceProtocol

if TYPE_CHECKING:
    from app.models.kit_pick_list import KitPickList


class PickListReportService:
    """Service for generating PDF reports of pick lists."""

    def __init__(self, metrics_service: MetricsServiceProtocol) -> None:
        """Initialize the report service with metrics integration.

        Args:
            metrics_service: Service for recording operational metrics
        """
        self.metrics_service = metrics_service

    def generate_pdf(self, pick_list: KitPickList) -> BytesIO:
        """Generate a PDF report for the given pick list.

        The PDF is organized by box number for efficient picking, with lines
        sorted by location within each box. Includes header info and a table
        with columns for location, part ID, description, expected quantity,
        actual quantity (blank for handwriting), and used checkbox.

        Args:
            pick_list: The pick list to generate a PDF for

        Returns:
            BytesIO buffer containing the PDF document, seeked to position 0
        """
        start_time = perf_counter()

        try:
            # Create PDF buffer and document
            buffer = BytesIO()
            doc = SimpleDocTemplate(
                buffer,
                pagesize=letter,
                rightMargin=0.5 * inch,
                leftMargin=0.5 * inch,
                topMargin=0.5 * inch,
                bottomMargin=0.5 * inch,
                title=f"Pick List {pick_list.id} - {pick_list.kit_name}",
            )

            # Build document content
            story = []
            styles = getSampleStyleSheet()

            # Add header section
            story.extend(self._build_header(pick_list, styles))
            story.append(Spacer(1, 0.25 * inch))

            # Group lines by box number and sort within each box
            lines_by_box = self._group_lines_by_box(pick_list)

            # Generate table for each box
            if lines_by_box:
                for box_no in sorted(lines_by_box.keys()):
                    story.extend(
                        self._build_box_section(box_no, lines_by_box[box_no], styles)
                    )
                    story.append(Spacer(1, 0.2 * inch))
            else:
                # Empty pick list
                story.append(
                    Paragraph("No lines to pick", styles["Normal"])
                )

            # Build the PDF
            doc.build(story)

            # Seek to start and record metrics
            buffer.seek(0)

            duration = perf_counter() - start_time
            box_count = len(lines_by_box)
            line_count = pick_list.line_count

            self.metrics_service.record_pick_list_pdf_generated(
                pick_list_id=pick_list.id,
                line_count=line_count,
                box_count=box_count,
            )
            self.metrics_service.record_pick_list_pdf_generation_duration(
                duration=duration,
                status="success",
            )

            return buffer

        except Exception:
            # Record failure metric
            duration = perf_counter() - start_time
            self.metrics_service.record_pick_list_pdf_generation_duration(
                duration=duration,
                status="error",
            )
            raise

    def _build_header(
        self, pick_list: KitPickList, styles: dict[str, Any]
    ) -> list[Any]:
        """Build the header section with kit and pick list information.

        Args:
            pick_list: The pick list to create a header for
            styles: ReportLab style sheet

        Returns:
            List of ReportLab flowables for the header
        """
        elements = []

        # Title
        title = Paragraph(
            f"<b>Pick List for {pick_list.kit_name}</b>",
            styles["Title"],
        )
        elements.append(title)
        elements.append(Spacer(1, 0.1 * inch))

        # Pick list metadata
        metadata_text = (
            f"<b>Pick List ID:</b> {pick_list.id} | "
            f"<b>Created:</b> {pick_list.created_at.strftime('%Y-%m-%d')} | "
            f"<b>Status:</b> {pick_list.status.value.title()} | "
            f"<b>Units to Build:</b> {pick_list.requested_units}"
        )
        metadata = Paragraph(metadata_text, styles["Normal"])
        elements.append(metadata)

        return elements

    def _group_lines_by_box(
        self, pick_list: KitPickList
    ) -> dict[int, list[Any]]:
        """Group pick list lines by box number and sort by location within each box.

        Args:
            pick_list: The pick list to group lines for

        Returns:
            Dictionary mapping box_no to list of lines, sorted by loc_no
        """
        lines_by_box: dict[int, list[Any]] = defaultdict(list)

        for line in pick_list.lines:
            if line.location:
                lines_by_box[line.location.box_no].append(line)

        # Sort lines within each box by loc_no
        for box_no in lines_by_box:
            lines_by_box[box_no].sort(
                key=lambda line: (
                    line.location.loc_no if line.location else 0,
                    line.id or 0,
                )
            )

        return lines_by_box

    def _build_box_section(
        self, box_no: int, lines: list[Any], styles: dict[str, Any]
    ) -> list[Any]:
        """Build a section for a single box with its lines in a table.

        Args:
            box_no: The box number
            lines: List of pick list lines for this box
            styles: ReportLab style sheet

        Returns:
            List of ReportLab flowables for the box section
        """
        elements = []

        # Get box description from first line (all lines in group have same box)
        box_description = ""
        if lines and lines[0].location and lines[0].location.box:
            box_description = lines[0].location.box.description or ""

        # Box header
        box_header = Paragraph(f"<b>#{box_no} - {box_description}</b>", styles["Heading2"])
        elements.append(box_header)
        elements.append(Spacer(1, 0.05 * inch))

        # Build table data
        table_data = [
            ["Location", "Part ID", "Description", "Expected", "Actual", "Used"]
        ]

        for line in lines:
            location_str = (
                f"{line.location.box_no}-{line.location.loc_no}"
                if line.location
                else ""
            )
            part_key = (
                line.kit_content.part_key
                if line.kit_content
                else ""
            )
            # Truncate long descriptions to fit in table
            description = (
                line.kit_content.part_description[:50]
                if line.kit_content and line.kit_content.part_description
                else ""
            )
            if (
                line.kit_content
                and line.kit_content.part_description
                and len(line.kit_content.part_description) > 50
            ):
                description += "..."

            table_data.append(
                [
                    location_str,
                    part_key,
                    description,
                    str(line.quantity_to_pick),
                    "____",  # Blank for handwriting actual picked
                    "____",  # Blank for handwriting used
                ]
            )

        # Create table with styling
        table = Table(
            table_data,
            colWidths=[0.8 * inch, 0.8 * inch, 3.5 * inch, 0.8 * inch, 0.7 * inch, 0.5 * inch],
        )

        table.setStyle(
            TableStyle(
                [
                    # Header row styling
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    # Data row styling
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("ALIGN", (3, 0), (3, -1), "CENTER"),  # Expected column (header + data)
                    ("ALIGN", (4, 0), (4, -1), "CENTER"),  # Actual column (header + data)
                    ("ALIGN", (5, 0), (5, -1), "CENTER"),  # Used column (header + data)
                    # Grid styling
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 1), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ]
            )
        )

        elements.append(table)

        return elements
