"""Remove attachment_metadata from part_attachments

Revision ID: 010
Revises: 009
Create Date: 2025-09-06 10:04:31.650835

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '010'
down_revision: str | None = '009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Drop attachment_metadata column from part_attachments table
    op.drop_column('part_attachments', 'attachment_metadata')


def downgrade() -> None:
    """Downgrade database schema."""
    # Re-add attachment_metadata column as JSONB
    op.add_column('part_attachments',
                  sa.Column('attachment_metadata',
                           postgresql.JSONB(astext_type=sa.Text()),
                           nullable=True))
