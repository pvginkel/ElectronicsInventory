"""Create box and location tables

Revision ID: 002
Revises:
Create Date: 2025-01-21 10:00:00.000000

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = '002'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create boxes table with surrogate key
    op.create_table('boxes',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('box_no', sa.Integer(), nullable=False),
    sa.Column('description', sa.String(), nullable=False),
    sa.Column('capacity', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('box_no')
    )

    # Create locations table with surrogate key
    op.create_table('locations',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('box_id', sa.Integer(), nullable=False),
    sa.Column('box_no', sa.Integer(), nullable=False),
    sa.Column('loc_no', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['box_id'], ['boxes.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('box_no', 'loc_no')
    )


def downgrade() -> None:
    op.drop_table('locations')
    op.drop_table('boxes')
