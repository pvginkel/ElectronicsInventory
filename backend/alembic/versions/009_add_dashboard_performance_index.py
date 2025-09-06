"""Add dashboard performance index

Revision ID: 009
Revises: 008
Create Date: 2025-09-05 22:30:42.643761

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '009'
down_revision: str | None = '008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Add composite index on quantity_history(timestamp, part_id) for dashboard performance
    # This optimizes queries that filter by timestamp and group by part_id
    op.create_index(
        'idx_quantity_history_timestamp_part_id',
        'quantity_history',
        ['timestamp', 'part_id']
    )


def downgrade() -> None:
    """Downgrade database schema."""
    # Remove the composite index
    op.drop_index('idx_quantity_history_timestamp_part_id', table_name='quantity_history')
