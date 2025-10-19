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


def test_list_active_reservations_returns_metadata(session):
    part = Part(key="LM358", description="Op-amp")
    kit = Kit(name="Audio Preamp", build_target=4, status=KitStatus.ACTIVE)

    session.add_all([part, kit])
    session.flush()
    session.add(KitContent(kit=kit, part=part, required_per_unit=2))
    session.commit()

    service = KitReservationService(session)

    entries = service.list_active_reservations_for_part(part.id)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.kit_id == kit.id
    assert entry.kit_name == "Audio Preamp"
    assert entry.status is KitStatus.ACTIVE
    assert entry.reserved_quantity == 8
    assert entry.updated_at is not None

    # Returned lists should be defensive copies
    entries.append(entry)
    fresh_entries = service.list_active_reservations_for_part(part.id)
    assert len(fresh_entries) == 1


def test_get_reservations_by_part_ids_includes_multiple_parts(session):
    resistor = Part(key="R100", description="Resistor")
    capacitor = Part(key="C100", description="Capacitor")
    kit = Kit(name="Mixed Kit", build_target=2, status=KitStatus.ACTIVE)
    session.add_all([resistor, capacitor, kit])
    session.flush()
    session.add_all(
        [
            KitContent(kit=kit, part=resistor, required_per_unit=1),
            KitContent(kit=kit, part=capacitor, required_per_unit=5),
        ]
    )
    session.commit()

    service = KitReservationService(session)
    reservations = service.get_reservations_by_part_ids([resistor.id, capacitor.id])

    assert set(reservations.keys()) == {resistor.id, capacitor.id}
    assert reservations[resistor.id][0].reserved_quantity == 2
    assert reservations[capacitor.id][0].reserved_quantity == 10
