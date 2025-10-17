"""Create kit contents table for kit BOM management

Revision ID: 018
Revises: 017
Create Date: 2025-12-12 00:00:01.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import func, text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the kit contents table with optimistic locking and constraints."""
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


def downgrade() -> None:
    """Drop kit contents table and indexes."""
    op.drop_index("ix_kit_contents_part_id", table_name="kit_contents")
    op.drop_index("ix_kit_contents_kit_id", table_name="kit_contents")
    op.drop_table("kit_contents")
