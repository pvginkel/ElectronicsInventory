"""Tests for kit shopping list link API endpoints."""

from app.models.kit import Kit, KitStatus
from app.models.kit_content import KitContent
from app.models.part import Part


def _create_link(session, container):
    kit = Kit(name="Link API Kit", build_target=1, status=KitStatus.ACTIVE)
    part = Part(key="APIL", description="API Link Part")
    session.add_all([kit, part])
    session.flush()

    content = KitContent(
        kit_id=kit.id,
        part_id=part.id,
        required_per_unit=2,
        note="API note",
    )
    session.add(content)
    session.commit()

    service = container.kit_shopping_list_service()
    result = service.create_or_append_list(
        kit.id,
        units=None,
        honor_reserved=False,
        shopping_list_id=None,
        note_prefix="Fallback",
        new_list_name="API Link List",
    )
    return kit, result.link


class TestKitShoppingListLinkApi:
    """Ensure DELETE endpoint manages link lifecycle."""

    def test_delete_link_removes_record(self, client, session, container):
        kit, link = _create_link(session, container)
        assert link is not None

        response = client.delete(f"/api/kit-shopping-list-links/{link.id}")
        assert response.status_code == 204

        remaining = container.kit_shopping_list_service().list_links_for_kit(kit.id)
        assert remaining == []

    def test_delete_missing_link_returns_not_found(self, client):
        response = client.delete("/api/kit-shopping-list-links/999999")
        assert response.status_code == 404
