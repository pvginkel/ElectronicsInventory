"""Create shopping lists and shopping list lines tables

Revision ID: 013
Revises: 012
Create Date: 2025-10-25 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create shopping list tables."""
    bind = op.get_bind()
    bind.execute(sa.text("DROP TYPE IF EXISTS shopping_list_status CASCADE"))
    bind.execute(sa.text("DROP TYPE IF EXISTS shopping_list_line_status CASCADE"))

    op.create_table(
        "shopping_lists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="concept", nullable=False),
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
        sa.UniqueConstraint("name", name="uq_shopping_lists_name"),
        sa.CheckConstraint(
            "status IN ('concept','ready','done')",
            name="ck_shopping_lists_status_valid",
        ),
    )

    op.create_table(
        "shopping_list_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("shopping_list_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=True),
        sa.Column("needed", sa.Integer(), nullable=False),
        sa.Column(
            "ordered",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "received",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="new", nullable=False),
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
        sa.ForeignKeyConstraint([
            "shopping_list_id"
        ], ["shopping_lists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seller_id"], ["sellers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "shopping_list_id",
            "part_id",
            name="uq_shopping_list_lines_list_part",
        ),
        sa.CheckConstraint(
            "needed >= 1",
            name="ck_shopping_list_lines_needed_positive",
        ),
        sa.CheckConstraint(
            "ordered >= 0 AND received >= 0",
            name="ck_shopping_list_lines_non_negative_progress",
        ),
        sa.CheckConstraint(
            "status IN ('new','ordered','done')",
            name="ck_shopping_list_lines_status_valid",
        ),
    )

    op.create_index(
        "ix_shopping_list_lines_shopping_list_id",
        "shopping_list_lines",
        ["shopping_list_id"],
    )
    op.create_index(
        "ix_shopping_list_lines_part_id",
        "shopping_list_lines",
        ["part_id"],
    )
    op.create_index(
        "ix_shopping_list_lines_status",
        "shopping_list_lines",
        ["status"],
    )


def downgrade() -> None:
    """Drop shopping list tables."""
    op.drop_index("ix_shopping_list_lines_status", table_name="shopping_list_lines")
    op.drop_index("ix_shopping_list_lines_part_id", table_name="shopping_list_lines")
    op.drop_index(
        "ix_shopping_list_lines_shopping_list_id",
        table_name="shopping_list_lines",
    )
    op.drop_table("shopping_list_lines")
    op.drop_table("shopping_lists")

    bind = op.get_bind()
    bind.execute(sa.text("DROP TYPE IF EXISTS shopping_list_line_status"))
    bind.execute(sa.text("DROP TYPE IF EXISTS shopping_list_status"))
