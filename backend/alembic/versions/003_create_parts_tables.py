"""Create parts, types, part_locations and quantity_history tables

Revision ID: 003
Revises: 002
Create Date: 2025-01-21 12:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create types table
    op.create_table('types',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(100), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )

    # Create parts table with 4-character key and foreign key to types
    op.create_table('parts',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('key', sa.CHAR(4), nullable=False),
    sa.Column('manufacturer_code', sa.String(255), nullable=True),
    sa.Column('type_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('tags', postgresql.ARRAY(sa.Text()).with_variant(sa.JSON(), "sqlite"), nullable=True),
    sa.Column('seller', sa.String(255), nullable=True),
    sa.Column('seller_link', sa.String(500), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['type_id'], ['types.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key')
    )

    # Create part_locations table with foreign keys and constraints
    op.create_table('part_locations',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('part_id', sa.Integer(), nullable=False),
    sa.Column('box_no', sa.Integer(), nullable=False),
    sa.Column('loc_no', sa.Integer(), nullable=False),
    sa.Column('location_id', sa.Integer(), nullable=False),
    sa.Column('qty', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('qty > 0'),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ),
    sa.ForeignKeyConstraint(['part_id'], ['parts.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('part_id', 'box_no', 'loc_no')
    )

    # Create quantity_history table
    op.create_table('quantity_history',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('part_id', sa.Integer(), nullable=False),
    sa.Column('delta_qty', sa.Integer(), nullable=False),
    sa.Column('location_reference', sa.String(20), nullable=True),
    sa.Column('timestamp', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['part_id'], ['parts.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # Add indexes for performance
    op.create_index('ix_parts_key', 'parts', ['key'])
    op.create_index('ix_parts_type_id', 'parts', ['type_id'])
    op.create_index('ix_part_locations_part_id', 'part_locations', ['part_id'])
    op.create_index('ix_part_locations_box_loc', 'part_locations', ['box_no', 'loc_no'])
    op.create_index('ix_quantity_history_part_id', 'quantity_history', ['part_id'])
    op.create_index('ix_quantity_history_timestamp', 'quantity_history', ['timestamp'])


def downgrade() -> None:
    op.drop_index('ix_quantity_history_timestamp')
    op.drop_index('ix_quantity_history_part_id')
    op.drop_index('ix_part_locations_box_loc')
    op.drop_index('ix_part_locations_part_id')
    op.drop_index('ix_parts_type_id')
    op.drop_index('ix_parts_key')
    op.drop_table('quantity_history')
    op.drop_table('part_locations')
    op.drop_table('parts')
    op.drop_table('types')
