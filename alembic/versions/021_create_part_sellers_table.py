"""Create part_sellers table, migrate data, drop old columns from parts.

This migration refactors the seller relationship from a single seller per part
(seller_id + seller_link on the parts table) to a many-to-many link table
(part_sellers) that supports multiple sellers per part with per-seller URLs.

Migration strategy:
1. Create part_sellers table with all columns and constraints.
2. Copy existing (part_id, seller_id, seller_link) rows where both are non-null.
3. Drop seller_link column from parts.
4. Drop seller_id column from parts (removes FK constraint and index).

Revision ID: 021
Revises: 020
Create Date: 2026-02-22 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Step 1: Create the part_sellers link table
    op.create_table(
        "part_sellers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("link", sa.String(length=500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["part_id"], ["parts.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"], ["sellers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("part_id", "seller_id", name="uq_part_sellers_part_seller"),
    )
    op.create_index(
        op.f("ix_part_sellers_part_id"), "part_sellers", ["part_id"], unique=False
    )
    op.create_index(
        op.f("ix_part_sellers_seller_id"), "part_sellers", ["seller_id"], unique=False
    )

    # Step 2: Migrate existing non-null (seller_id, seller_link) pairs from parts
    op.execute(
        sa.text(
            "INSERT INTO part_sellers (part_id, seller_id, link, created_at) "
            "SELECT id, seller_id, seller_link, now() "
            "FROM parts "
            "WHERE seller_id IS NOT NULL AND seller_link IS NOT NULL"
        )
    )

    # Step 3: Drop seller_link column from parts
    op.drop_column("parts", "seller_link")

    # Step 4: Drop seller_id column from parts (also removes FK and index)
    op.drop_column("parts", "seller_id")


def downgrade() -> None:
    # Re-add seller_id and seller_link columns to parts
    op.add_column(
        "parts",
        sa.Column("seller_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "parts",
        sa.Column("seller_link", sa.String(length=500), nullable=True),
    )
    op.create_foreign_key(
        "fk_parts_seller_id",
        "parts",
        "sellers",
        ["seller_id"],
        ["id"],
    )

    # Migrate data back: pick the first part_sellers row per part
    op.execute(
        sa.text(
            "UPDATE parts SET seller_id = ps.seller_id, seller_link = ps.link "
            "FROM (SELECT DISTINCT ON (part_id) part_id, seller_id, link "
            "      FROM part_sellers ORDER BY part_id, id) ps "
            "WHERE parts.id = ps.part_id"
        )
    )

    # Drop part_sellers table
    op.drop_index(op.f("ix_part_sellers_seller_id"), table_name="part_sellers")
    op.drop_index(op.f("ix_part_sellers_part_id"), table_name="part_sellers")
    op.drop_table("part_sellers")
