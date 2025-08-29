"""Add document management tables and cover_attachment_id to parts

Revision ID: 004
Revises: 003
Create Date: 2025-01-21 18:00:00.000000

"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create part_attachments table
    op.create_table('part_attachments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('part_id', sa.Integer(), nullable=False),
        sa.Column('attachment_type', sa.Enum('url', 'image', 'pdf', name='attachment_type'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('s3_key', sa.String(500), nullable=True),
        sa.Column('url', sa.String(2000), nullable=True),
        sa.Column('filename', sa.String(255), nullable=True),
        sa.Column('content_type', sa.String(100), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('attachment_metadata', postgresql.JSONB().with_variant(sa.JSON(), "sqlite"), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['part_id'], ['parts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Add cover_attachment_id to parts table
    op.add_column('parts', sa.Column('cover_attachment_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_parts_cover_attachment', 'parts', 'part_attachments', ['cover_attachment_id'], ['id'])

    # Add indexes for performance
    op.create_index('ix_part_attachments_part_id', 'part_attachments', ['part_id'])
    op.create_index('ix_part_attachments_type', 'part_attachments', ['attachment_type'])
    op.create_index('ix_parts_cover_attachment_id', 'parts', ['cover_attachment_id'])


def downgrade() -> None:
    op.drop_index('ix_parts_cover_attachment_id')
    op.drop_index('ix_part_attachments_type')
    op.drop_index('ix_part_attachments_part_id')
    op.drop_constraint('fk_parts_cover_attachment', 'parts', type_='foreignkey')
    op.drop_column('parts', 'cover_attachment_id')
    op.drop_table('part_attachments')
    op.execute('DROP TYPE attachment_type')