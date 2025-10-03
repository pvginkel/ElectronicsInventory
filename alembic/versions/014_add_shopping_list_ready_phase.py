"""Add seller notes and ready view indexes

Revision ID: 014
Revises: 013
Create Date: 2025-11-15 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create seller notes table and supporting indexes."""
    op.create_table(
        "shopping_list_seller_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("shopping_list_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["shopping_list_id"],
            ["shopping_lists.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint([
            "seller_id"
        ], ["sellers.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "shopping_list_id",
            "seller_id",
            name="uq_shopping_list_seller_notes_list_seller",
        ),
    )

    op.create_index(
        "ix_shopping_list_seller_notes_list_id",
        "shopping_list_seller_notes",
        ["shopping_list_id"],
    )
    op.create_index(
        "ix_shopping_list_seller_notes_seller_id",
        "shopping_list_seller_notes",
        ["seller_id"],
    )

    op.create_index(
        "ix_shopping_list_lines_list_seller",
        "shopping_list_lines",
        ["shopping_list_id", "seller_id"],
    )


def downgrade() -> None:
    """Drop seller notes table and related indexes."""
    op.drop_index(
        "ix_shopping_list_lines_list_seller",
        table_name="shopping_list_lines",
    )
    op.drop_index(
        "ix_shopping_list_seller_notes_seller_id",
        table_name="shopping_list_seller_notes",
    )
    op.drop_index(
        "ix_shopping_list_seller_notes_list_id",
        table_name="shopping_list_seller_notes",
    )
    op.drop_table("shopping_list_seller_notes")
