"""Add extended part fields

Revision ID: 852fac0aed49
Revises: 004
Create Date: 2025-08-30 20:24:37.083617

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: str | None = '004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Add extended part fields
    op.add_column('parts', sa.Column('package', sa.String(100), nullable=True))
    op.add_column('parts', sa.Column('pin_count', sa.Integer(), nullable=True))
    op.add_column('parts', sa.Column('voltage_rating', sa.String(50), nullable=True))
    op.add_column('parts', sa.Column('mounting_type', sa.String(50), nullable=True))
    op.add_column('parts', sa.Column('series', sa.String(100), nullable=True))
    op.add_column('parts', sa.Column('dimensions', sa.String(100), nullable=True))

    # Add check constraint for pin_count
    op.create_check_constraint('ck_parts_pin_count_positive', 'parts', 'pin_count > 0 OR pin_count IS NULL')

    # Add indexes for search performance
    op.create_index('ix_parts_package', 'parts', ['package'])
    op.create_index('ix_parts_series', 'parts', ['series'])
    op.create_index('ix_parts_voltage_rating', 'parts', ['voltage_rating'])
    op.create_index('ix_parts_mounting_type', 'parts', ['mounting_type'])


def downgrade() -> None:
    """Downgrade database schema."""
    # Remove indexes
    op.drop_index('ix_parts_mounting_type', 'parts')
    op.drop_index('ix_parts_voltage_rating', 'parts')
    op.drop_index('ix_parts_series', 'parts')
    op.drop_index('ix_parts_package', 'parts')

    # Remove check constraint
    op.drop_constraint('ck_parts_pin_count_positive', 'parts', type_='check')

    # Remove extended part fields
    op.drop_column('parts', 'dimensions')
    op.drop_column('parts', 'series')
    op.drop_column('parts', 'mounting_type')
    op.drop_column('parts', 'voltage_rating')
    op.drop_column('parts', 'pin_count')
    op.drop_column('parts', 'package')
