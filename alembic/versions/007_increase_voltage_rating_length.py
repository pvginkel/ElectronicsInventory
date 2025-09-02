"""Increase voltage_rating field length from 50 to 100 characters

Revision ID: 007
Revises: 006
Create Date: 2025-09-02 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '007'
down_revision: str | None = '006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Increase voltage_rating column length to 100 characters."""
    op.alter_column('parts', 'voltage_rating',
                    existing_type=sa.String(50),
                    type_=sa.String(100),
                    existing_nullable=True,
                    existing_server_default=None)


def downgrade() -> None:
    """Decrease voltage_rating column length back to 50 characters."""
    op.alter_column('parts', 'voltage_rating',
                    existing_type=sa.String(100),
                    type_=sa.String(50),
                    existing_nullable=True,
                    existing_server_default=None)
