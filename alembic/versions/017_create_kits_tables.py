"""Create kit domain tables and supporting constraints.

Revision ID: 017
Revises: 016
Create Date: 2026-04-30 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import func, text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "017"
down_revision: str | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


KIT_STATUS_ENUM = sa.Enum(
    "active",
    "archived",
    name="kit_status",
    native_enum=False,
)

KIT_PICK_LIST_STATUS_ENUM = sa.Enum(
    "open",
    "completed",
    name="kit_pick_list_status",
    native_enum=False,
)

KIT_PICK_LIST_LINE_STATUS_ENUM = sa.Enum(
    "open",
    "completed",
    name="kit_pick_list_line_status",
    native_enum=False,
)


def upgrade() -> None:
    """Create kit tables, indexes, and workflow constraints."""
    op.create_table(
        "kits",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "build_target",
            sa.Integer(),
            nullable=False,
            server_default=text("1"),
        ),
        sa.Column(
            "status",
            KIT_STATUS_ENUM,
            nullable=False,
            server_default="active",
        ),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
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
        sa.UniqueConstraint("name", name="uq_kits_name"),
        sa.CheckConstraint(
            "build_target >= 1",
            name="ck_kits_build_target_positive",
        ),
        sa.CheckConstraint(
            "(status != 'archived') OR (archived_at IS NOT NULL)",
            name="ck_kits_archived_requires_timestamp",
        ),
    )

    op.create_index("ix_kits_status", "kits", ["status"])
    op.create_index(
        "ix_kits_status_updated_at_desc",
        "kits",
        ["status", "updated_at"],
        postgresql_using="btree",
        postgresql_ops={"updated_at": "DESC"},
    )
    op.create_index(
        "ix_kits_lower_name",
        "kits",
        [sa.text("lower(name)")],
    )

    op.create_table(
        "kit_shopping_list_links",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "kit_id",
            sa.Integer(),
            sa.ForeignKey("kits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "shopping_list_id",
            sa.Integer(),
            sa.ForeignKey("shopping_lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requested_units",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "honor_reserved",
            sa.Boolean(),
            nullable=False,
        ),
        sa.Column(
            "snapshot_kit_updated_at",
            sa.DateTime(),
            nullable=False,
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
        sa.UniqueConstraint(
            "kit_id",
            "shopping_list_id",
            name="uq_kit_shopping_list_link",
        ),
        sa.CheckConstraint(
            "requested_units >= 1",
            name="ck_kit_shopping_list_links_requested_units_positive",
        ),
    )
    op.create_index(
        "ix_kit_shopping_list_links_kit_id",
        "kit_shopping_list_links",
        ["kit_id"],
    )
    op.create_index(
        "ix_kit_shopping_list_links_shopping_list_id",
        "kit_shopping_list_links",
        ["shopping_list_id"],
    )

    op.create_table(
        "kit_contents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "kit_id",
            sa.Integer(),
            sa.ForeignKey("kits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "part_id",
            sa.Integer(),
            sa.ForeignKey("parts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "required_per_unit",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "version",
            sa.BigInteger(),
            nullable=False,
            server_default=text("1"),
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
        sa.CheckConstraint(
            "required_per_unit >= 1",
            name="ck_kit_contents_required_positive",
        ),
        sa.UniqueConstraint(
            "kit_id",
            "part_id",
            name="uq_kit_contents_kit_part",
        ),
    )
    op.create_index(
        "ix_kit_contents_kit_id",
        "kit_contents",
        ["kit_id"],
    )
    op.create_index(
        "ix_kit_contents_part_id",
        "kit_contents",
        ["part_id"],
    )

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
            KIT_PICK_LIST_STATUS_ENUM,
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
            KIT_PICK_LIST_LINE_STATUS_ENUM,
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
    """Drop kit tables and associated indexes."""
    op.drop_index(
        "ix_kit_pick_list_lines_pick_list_id_status",
        table_name="kit_pick_list_lines",
    )
    op.drop_table("kit_pick_list_lines")

    op.drop_index("ix_kit_pick_lists_status", table_name="kit_pick_lists")
    op.drop_index("ix_kit_pick_lists_kit_id", table_name="kit_pick_lists")
    op.drop_table("kit_pick_lists")

    op.drop_index("ix_kit_contents_part_id", table_name="kit_contents")
    op.drop_index("ix_kit_contents_kit_id", table_name="kit_contents")
    op.drop_table("kit_contents")

    op.drop_index(
        "ix_kit_shopping_list_links_shopping_list_id",
        table_name="kit_shopping_list_links",
    )
    op.drop_index(
        "ix_kit_shopping_list_links_kit_id",
        table_name="kit_shopping_list_links",
    )
    op.drop_table("kit_shopping_list_links")

    op.drop_index("ix_kits_lower_name", table_name="kits")
    op.drop_index("ix_kits_status_updated_at_desc", table_name="kits")
    op.drop_index("ix_kits_status", table_name="kits")
    op.drop_table("kits")

    KIT_PICK_LIST_LINE_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
    KIT_PICK_LIST_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
    KIT_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
