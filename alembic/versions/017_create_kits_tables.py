"""Create kit tables and supporting indexes

Revision ID: 017
Revises: 016
Create Date: 2025-12-12 00:00:00.000000

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

KIT_LINKED_STATUS_ENUM = sa.Enum(
    "concept",
    "ready",
    "done",
    name="kit_linked_status",
    native_enum=False,
)

KIT_PICK_LIST_STATUS_ENUM = sa.Enum(
    "draft",
    "in_progress",
    "completed",
    name="kit_pick_list_status",
    native_enum=False,
)


def upgrade() -> None:
    """Create kit tables with lifecycle metadata."""
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
            "linked_status",
            KIT_LINKED_STATUS_ENUM,
            nullable=False,
        ),
        sa.Column(
            "snapshot_kit_updated_at",
            sa.DateTime(),
            nullable=True,
        ),
        sa.Column(
            "is_stale",
            sa.Boolean(),
            nullable=False,
            server_default=text("false"),
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
        "kit_pick_lists",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "kit_id",
            sa.Integer(),
            sa.ForeignKey("kits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requested_units",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "status",
            KIT_PICK_LIST_STATUS_ENUM,
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
        "ix_kit_pick_lists_kit_id",
        "kit_pick_lists",
        ["kit_id"],
    )
    op.create_index(
        "ix_kit_pick_lists_status",
        "kit_pick_lists",
        ["status"],
    )


def downgrade() -> None:
    """Drop kit tables and associated indexes."""
    op.drop_index("ix_kit_pick_lists_status", table_name="kit_pick_lists")
    op.drop_index("ix_kit_pick_lists_kit_id", table_name="kit_pick_lists")
    op.drop_table("kit_pick_lists")

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

    KIT_PICK_LIST_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
    KIT_LINKED_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
    KIT_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
