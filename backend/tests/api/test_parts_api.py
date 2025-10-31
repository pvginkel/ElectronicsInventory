"""Tests for parts API endpoints covering kit usage navigation."""

from datetime import UTC, datetime

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part


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
