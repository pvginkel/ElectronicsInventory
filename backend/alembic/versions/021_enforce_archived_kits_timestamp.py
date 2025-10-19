"""Ensure archived kits include a timestamp.

Revision ID: 021
Revises: 020
Create Date: 2026-04-14 00:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Backfill archived kits and enforce timestamp requirement."""
    op.execute(
        sa.text(
            "UPDATE kits "
            "SET archived_at = NOW() "
            "WHERE status = 'archived' AND archived_at IS NULL"
        )
    )
    op.create_check_constraint(
        "ck_kits_archived_requires_timestamp",
        "kits",
        "(status != 'archived') OR (archived_at IS NOT NULL)",
    )


def downgrade() -> None:
    """Remove archived timestamp guard for kits."""
    op.drop_constraint(
        "ck_kits_archived_requires_timestamp",
        "kits",
        type_="check",
    )
