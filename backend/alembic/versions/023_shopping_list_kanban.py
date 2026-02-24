"""Shopping list kanban: simplify status enum and replace seller notes with seller groups.

Revision ID: 023
Revises: 022
Create Date: 2026-02-24 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Simplify shopping list status: concept/ready -> active
    op.drop_constraint("ck_shopping_lists_status_valid", "shopping_lists", type_="check")
    op.execute(
        "UPDATE shopping_lists SET status = 'active' WHERE status IN ('concept', 'ready')"
    )
    op.create_check_constraint(
        "ck_shopping_lists_status_valid",
        "shopping_lists",
        "status IN ('active','done')",
    )

    # 2. Create the new shopping_list_sellers table
    op.create_table(
        "shopping_list_sellers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("shopping_list_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=50),
            server_default="active",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            ["sellers.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["shopping_list_id"],
            ["shopping_lists.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('active','ordered')",
            name="ck_shopping_list_sellers_status_valid",
        ),
        sa.UniqueConstraint(
            "shopping_list_id",
            "seller_id",
            name="uq_shopping_list_sellers_list_seller",
        ),
    )
    op.create_index(
        "ix_shopping_list_sellers_shopping_list_id",
        "shopping_list_sellers",
        ["shopping_list_id"],
    )
    op.create_index(
        "ix_shopping_list_sellers_seller_id",
        "shopping_list_sellers",
        ["seller_id"],
    )

    # 3. Migrate existing seller notes into the new table (all as active)
    op.execute(
        """
        INSERT INTO shopping_list_sellers (shopping_list_id, seller_id, note, status, created_at, updated_at)
        SELECT shopping_list_id, seller_id, note, 'active', created_at, updated_at
        FROM shopping_list_seller_notes
        """
    )

    # 4. Drop the old seller notes table
    op.drop_table("shopping_list_seller_notes")


def downgrade() -> None:
    # 1. Recreate the old seller notes table
    op.create_table(
        "shopping_list_seller_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("shopping_list_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            ["sellers.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["shopping_list_id"],
            ["shopping_lists.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "shopping_list_id",
            "seller_id",
            name="uq_shopping_list_seller_notes_list_seller",
        ),
    )

    # 2. Copy data back (lossy: status column is dropped, NULL notes become '')
    op.execute(
        """
        INSERT INTO shopping_list_seller_notes (shopping_list_id, seller_id, note, created_at, updated_at)
        SELECT shopping_list_id, seller_id, COALESCE(note, ''), created_at, updated_at
        FROM shopping_list_sellers
        """
    )

    # 3. Drop the new table
    op.drop_table("shopping_list_sellers")

    # 4. Revert status (lossy: active -> concept since we can't distinguish)
    op.drop_constraint("ck_shopping_lists_status_valid", "shopping_lists", type_="check")
    op.execute(
        "UPDATE shopping_lists SET status = 'concept' WHERE status = 'active'"
    )
    op.create_check_constraint(
        "ck_shopping_lists_status_valid",
        "shopping_lists",
        "status IN ('concept','ready','done')",
    )
