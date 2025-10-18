"""Rebuild pick list workflow tables with persisted line allocations.

Revision ID: 020
Revises: 019
Create Date: 2026-02-10 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import func, text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _kit_pick_list_status_enum() -> sa.Enum:
    """Return SQLAlchemy enum for pick list status states."""
    return sa.Enum(
        "open",
        "completed",
        name="kit_pick_list_status",
        native_enum=False,
    )


def _legacy_kit_pick_list_status_enum() -> sa.Enum:
    """Return SQLAlchemy enum for the legacy pick list status values."""
    return sa.Enum(
        "draft",
        "in_progress",
        "completed",
        name="kit_pick_list_status",
        native_enum=False,
    )


def _pick_list_line_status_enum() -> sa.Enum:
    """Return SQLAlchemy enum for pick list line lifecycle states."""
    return sa.Enum(
        "open",
        "completed",
        name="kit_pick_list_line_status",
        native_enum=False,
    )


def upgrade() -> None:
    """Recreate pick list tables with persisted line tracking."""
    op.drop_table("kit_pick_lists")

    op.create_table(
        "kit_pick_lists",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "kit_id",
            sa.Integer(),
            sa.ForeignKey("kits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("requested_units", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _kit_pick_list_status_enum(),
            nullable=False,
            server_default="open",
        ),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=func.now(),
        ),
        sa.CheckConstraint(
            "requested_units >= 1",
            name="ck_kit_pick_lists_requested_units_positive",
        ),
    )
    op.create_index(
        "ix_kit_pick_lists_kit_id",
        "kit_pick_lists",
        ["kit_id"],
    )
    op.create_index(
        "ix_kit_pick_lists_status",
        "kit_pick_lists",
        ["status"],
    )

    op.create_table(
        "kit_pick_list_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "pick_list_id",
            sa.Integer(),
            sa.ForeignKey("kit_pick_lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kit_content_id",
            sa.Integer(),
            sa.ForeignKey("kit_contents.id"),
            nullable=False,
        ),
        sa.Column(
            "location_id",
            sa.Integer(),
            sa.ForeignKey("locations.id"),
            nullable=False,
        ),
        sa.Column("quantity_to_pick", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _pick_list_line_status_enum(),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "inventory_change_id",
            sa.Integer(),
            sa.ForeignKey("quantity_history.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("picked_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=func.now(),
        ),
        sa.CheckConstraint(
            "quantity_to_pick >= 1",
            name="ck_pick_list_lines_quantity_positive",
        ),
        sa.UniqueConstraint(
            "pick_list_id",
            "kit_content_id",
            "location_id",
            name="uq_pick_list_line_allocation",
        ),
    )
    op.create_index(
        "ix_kit_pick_list_lines_pick_list_id_status",
        "kit_pick_list_lines",
        ["pick_list_id", "status"],
    )


def downgrade() -> None:
    """Revert to the original pick list schema without persisted lines."""
    op.drop_index(
        "ix_kit_pick_list_lines_pick_list_id_status",
        table_name="kit_pick_list_lines",
    )
    op.drop_table("kit_pick_list_lines")

    op.drop_index("ix_kit_pick_lists_status", table_name="kit_pick_lists")
    op.drop_index("ix_kit_pick_lists_kit_id", table_name="kit_pick_lists")
    op.drop_table("kit_pick_lists")

    op.create_table(
        "kit_pick_lists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "kit_id",
            sa.Integer(),
            nullable=False,
            autoincrement=False,
        ),
        sa.Column("requested_units", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _legacy_kit_pick_list_status_enum(),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("first_deduction_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "decreased_build_target_by",
            sa.Integer(),
            nullable=False,
            server_default=text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["kit_id"],
            ["kits.id"],
            name="kit_pick_lists_kit_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="kit_pick_lists_pkey"),
        sa.CheckConstraint(
            "requested_units >= 1",
            name="ck_kit_pick_lists_requested_units_positive",
        ),
        sa.CheckConstraint(
            "decreased_build_target_by >= 0",
            name="ck_kit_pick_lists_decreased_build_target_nonnegative",
        ),
    )
    op.create_index(
        "ix_kit_pick_lists_status",
        "kit_pick_lists",
        ["status"],
    )
    op.create_index(
        "ix_kit_pick_lists_kit_id",
        "kit_pick_lists",
        ["kit_id"],
    )
