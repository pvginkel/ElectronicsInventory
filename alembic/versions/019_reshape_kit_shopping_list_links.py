"""Reshape kit shopping list links for requested units and honor reserved flags.

Revision ID: 019
Revises: 018
Create Date: 2026-01-05 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


KIT_LINKED_STATUS_ENUM = sa.Enum(
    "concept",
    "ready",
    "done",
    name="kit_linked_status",
    native_enum=False,
)


def upgrade() -> None:
    """Add requested_units and honor_reserved flags, drop legacy columns."""
    with op.batch_alter_table("kit_shopping_list_links") as batch:
        batch.add_column(
            sa.Column(
                "requested_units",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )
        batch.add_column(
            sa.Column(
                "honor_reserved",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            )
        )
        batch.alter_column(
            "snapshot_kit_updated_at",
            existing_type=sa.DateTime(),
            nullable=False,
        )
        batch.create_check_constraint(
            "ck_kit_shopping_list_links_requested_units_positive",
            "requested_units >= 1",
        )
        batch.drop_column("linked_status")
        batch.drop_column("is_stale")

    op.alter_column(
        "kit_shopping_list_links",
        "requested_units",
        server_default=None,
    )
    op.alter_column(
        "kit_shopping_list_links",
        "honor_reserved",
        server_default=None,
    )

    KIT_LINKED_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    """Reintroduce legacy columns and remove requested units metadata."""
    KIT_LINKED_STATUS_ENUM.create(op.get_bind(), checkfirst=True)

    with op.batch_alter_table("kit_shopping_list_links") as batch:
        batch.add_column(
            sa.Column(
                "linked_status",
                KIT_LINKED_STATUS_ENUM,
                nullable=False,
                server_default="concept",
            )
        )
        batch.add_column(
            sa.Column(
                "is_stale",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            )
        )
        batch.alter_column(
            "snapshot_kit_updated_at",
            existing_type=sa.DateTime(),
            nullable=True,
        )
        batch.drop_constraint(
            "ck_kit_shopping_list_links_requested_units_positive",
            type_="check",
        )
        batch.drop_column("honor_reserved")
        batch.drop_column("requested_units")

    op.alter_column(
        "kit_shopping_list_links",
        "linked_status",
        server_default=None,
    )
