"""Add logo_s3_key column to sellers table.

Revision ID: 022
Revises: 021
Create Date: 2026-02-23 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sellers",
        sa.Column("logo_s3_key", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sellers", "logo_s3_key")
