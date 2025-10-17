"""Tests for KitReservationService reserved quantity calculations."""

from datetime import UTC, datetime

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part
from app.services.kit_reservation_service import KitReservationService


def test_reserved_totals_exclude_archived_and_subject(session):
    part = Part(key="RS01", description="Resistor stack")
    other_part = Part(key="RS02", description="Comparator")

    subject = Kit(name="Subject Kit", build_target=2, status=KitStatus.ACTIVE)
    other_active = Kit(name="Other Active", build_target=3, status=KitStatus.ACTIVE)
    archived = Kit(
        name="Archived Kit",
        build_target=5,
        status=KitStatus.ARCHIVED,
        archived_at=datetime.now(UTC),
    )

    session.add_all([part, other_part, subject, other_active, archived])
    session.flush()

    session.add_all(
        [
            KitContent(kit=subject, part=part, required_per_unit=2),
            KitContent(kit=other_active, part=part, required_per_unit=1),
            KitContent(kit=archived, part=part, required_per_unit=4),
            KitContent(kit=other_active, part=other_part, required_per_unit=2),
        ]
    )
    session.commit()

    service = KitReservationService(session)

    totals = service.get_reserved_totals_for_parts(
        [part.id, other_part.id],
        exclude_kit_id=subject.id,
    )
    # Only other_active kit should count: 1 required per unit * build_target 3 = 3
    assert totals[part.id] == 3
    assert totals[other_part.id] == 6

    # Without exclusion, subject kit should also contribute (2 * build_target 2 = 4)
    totals_all = service.get_reserved_totals_for_parts([part.id])
    assert totals_all[part.id] == 7


def test_reserved_totals_handles_empty_input(session):
    service = KitReservationService(session)
    assert service.get_reserved_totals_for_parts([]) == {}
