"""Create sellers table and update parts to use seller_id foreign key

Revision ID: 011
Revises: 010
Create Date: 2025-09-17 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '011'
down_revision: str | None = '010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Create sellers table
    op.create_table('sellers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('website', sa.String(500), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # Create index on name for performance
    op.create_index('ix_sellers_name', 'sellers', ['name'])

    # Add seller_id foreign key to parts table
    op.add_column('parts', sa.Column('seller_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_parts_seller_id', 'parts', 'sellers', ['seller_id'], ['id'])

    # Drop the old seller column (no data migration)
    op.drop_column('parts', 'seller')


def downgrade() -> None:
    """Downgrade database schema."""
    # Re-add seller column to parts table
    op.add_column('parts', sa.Column('seller', sa.String(255), nullable=True))

    # Drop seller_id foreign key and column
    op.drop_constraint('fk_parts_seller_id', 'parts', type_='foreignkey')
    op.drop_column('parts', 'seller_id')

    # Drop sellers table and index
    op.drop_index('ix_sellers_name', 'sellers')
    op.drop_table('sellers')
