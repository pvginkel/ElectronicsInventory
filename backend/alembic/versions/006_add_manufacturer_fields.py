"""Add manufacturer and product_page fields to parts table

Revision ID: 006
Revises: 005
Create Date: 2025-08-31 15:54:03.157480

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: str | None = '005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add manufacturer and product_page fields to parts table."""
    op.add_column('parts', sa.Column('manufacturer', sa.String(255), nullable=True))
    op.add_column('parts', sa.Column('product_page', sa.String(500), nullable=True))


def downgrade() -> None:
    """Remove manufacturer and product_page fields from parts table."""
    op.drop_column('parts', 'product_page')
    op.drop_column('parts', 'manufacturer')
