"""Create AttachmentSet aggregate and migrate existing attachments.

This migration introduces the AttachmentSet aggregate pattern for managing
attachments across both Parts and Kits, replacing the part-specific attachment system.

Migration strategy:
1. Create attachment_sets table
2. Rename part_attachments to attachments
3. Add attachment_set_id to attachments (nullable during migration)
4. Backfill: create attachment set for each part with attachments
5. Update attachments to point to their sets
6. Add attachment_set_id to parts and kits (nullable during migration)
7. Update parts and kits to point to their sets
8. Move cover references from parts to attachment_sets
9. Make attachment_set_id NOT NULL on attachments, parts, and kits
10. Drop cover_attachment_id from parts

Revision ID: 020
Revises: 019
Create Date: 2025-12-30 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "020"
down_revision: str | None = "019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Migrate to AttachmentSet aggregate pattern."""

    # Step 1: Create attachment_sets table (without cover FK initially)
    op.create_table(
        'attachment_sets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Step 2: Rename part_attachments to attachments
    op.rename_table('part_attachments', 'attachments')

    # Step 3: Add attachment_set_id to attachments (nullable during migration)
    op.add_column('attachments', sa.Column('attachment_set_id', sa.Integer(), nullable=True))

    # Step 4 & 5: Backfill attachment sets for existing parts
    # For each distinct part_id in attachments, create an attachment_set and link attachments
    connection = op.get_bind()

    # Get all parts that have attachments
    parts_with_attachments = connection.execute(
        sa.text("SELECT DISTINCT part_id FROM attachments ORDER BY part_id")
    ).fetchall()

    for (part_id,) in parts_with_attachments:
        # Create attachment set for this part
        result = connection.execute(
            sa.text("INSERT INTO attachment_sets (created_at, updated_at) VALUES (now(), now()) RETURNING id")
        )
        row = result.fetchone()
        assert row is not None
        attachment_set_id = row[0]

        # Update all attachments for this part to point to the new set
        connection.execute(
            sa.text("UPDATE attachments SET attachment_set_id = :set_id WHERE part_id = :part_id"),
            {"set_id": attachment_set_id, "part_id": part_id}
        )

    # Step 6: Add attachment_set_id to parts (nullable during migration)
    op.add_column('parts', sa.Column('attachment_set_id', sa.Integer(), nullable=True))

    # Step 7: Update parts to point to their attachment sets
    # Each part gets the attachment_set_id from its first attachment
    connection.execute(
        sa.text("""
            UPDATE parts p
            SET attachment_set_id = (
                SELECT a.attachment_set_id
                FROM attachments a
                WHERE a.part_id = p.id
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1 FROM attachments a WHERE a.part_id = p.id
            )
        """)
    )

    # For parts without attachments, create empty attachment sets
    parts_without_sets = connection.execute(
        sa.text("SELECT id FROM parts WHERE attachment_set_id IS NULL")
    ).fetchall()

    for (part_id,) in parts_without_sets:
        result = connection.execute(
            sa.text("INSERT INTO attachment_sets (created_at, updated_at) VALUES (now(), now()) RETURNING id")
        )
        row = result.fetchone()
        assert row is not None
        attachment_set_id = row[0]
        connection.execute(
            sa.text("UPDATE parts SET attachment_set_id = :set_id WHERE id = :part_id"),
            {"set_id": attachment_set_id, "part_id": part_id}
        )

    # Step 8: Move cover references from parts to attachment_sets
    # For each part with a cover_attachment_id, set that as the cover on the attachment set
    connection.execute(
        sa.text("""
            UPDATE attachment_sets aset
            SET cover_attachment_id = p.cover_attachment_id
            FROM parts p
            WHERE p.attachment_set_id = aset.id
              AND p.cover_attachment_id IS NOT NULL
        """)
    )

    # Step 6b & 7b: Add attachment_set_id to kits and create sets for all kits
    op.add_column('kits', sa.Column('attachment_set_id', sa.Integer(), nullable=True))

    all_kits = connection.execute(sa.text("SELECT id FROM kits")).fetchall()
    for (kit_id,) in all_kits:
        result = connection.execute(
            sa.text("INSERT INTO attachment_sets (created_at, updated_at) VALUES (now(), now()) RETURNING id")
        )
        row = result.fetchone()
        assert row is not None
        attachment_set_id = row[0]
        connection.execute(
            sa.text("UPDATE kits SET attachment_set_id = :set_id WHERE id = :kit_id"),
            {"set_id": attachment_set_id, "kit_id": kit_id}
        )

    # Step 9: Make attachment_set_id NOT NULL and add FK constraints
    # First drop the old part_id FK from attachments
    op.drop_constraint('attachments_part_id_fkey', 'attachments', type_='foreignkey')
    op.drop_index('ix_part_attachments_part_id', 'attachments')

    # Make attachment_set_id NOT NULL on attachments and add FK
    op.alter_column('attachments', 'attachment_set_id', nullable=False)
    op.create_foreign_key(
        'fk_attachments_attachment_set',
        'attachments',
        'attachment_sets',
        ['attachment_set_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_index('ix_attachments_attachment_set_id', 'attachments', ['attachment_set_id'])

    # Make attachment_set_id NOT NULL on parts and add FK
    op.alter_column('parts', 'attachment_set_id', nullable=False)
    op.create_foreign_key(
        'fk_parts_attachment_set',
        'parts',
        'attachment_sets',
        ['attachment_set_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_index('ix_parts_attachment_set_id', 'parts', ['attachment_set_id'])

    # Make attachment_set_id NOT NULL on kits and add FK
    op.alter_column('kits', 'attachment_set_id', nullable=False)
    op.create_foreign_key(
        'fk_kits_attachment_set',
        'kits',
        'attachment_sets',
        ['attachment_set_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_index('ix_kits_attachment_set_id', 'kits', ['attachment_set_id'])

    # Add cover_attachment_id FK to attachment_sets (deferred with use_alter)
    op.create_foreign_key(
        'fk_attachment_sets_cover',
        'attachment_sets',
        'attachments',
        ['cover_attachment_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Step 10: Drop part_id column and old cover_attachment_id from parts
    op.drop_column('attachments', 'part_id')

    op.drop_index('ix_parts_cover_attachment_id', 'parts')
    op.drop_constraint('fk_parts_cover_attachment', 'parts', type_='foreignkey')
    op.drop_column('parts', 'cover_attachment_id')


def downgrade() -> None:
    """Revert to part-specific attachment system.

    WARNING: This downgrade will lose kit attachments and any attachments
    created through the AttachmentSet API that don't belong to parts.
    """

    # Add back cover_attachment_id to parts
    op.add_column('parts', sa.Column('cover_attachment_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_parts_cover_attachment', 'parts', 'attachments', ['cover_attachment_id'], ['id'])
    op.create_index('ix_parts_cover_attachment_id', 'parts', ['cover_attachment_id'])

    # Add back part_id to attachments
    op.add_column('attachments', sa.Column('part_id', sa.Integer(), nullable=True))

    # Restore part_id references from parts.attachment_set_id relationship
    connection = op.get_bind()
    connection.execute(
        sa.text("""
            UPDATE attachments a
            SET part_id = p.id
            FROM parts p
            WHERE a.attachment_set_id = p.attachment_set_id
        """)
    )

    # Make part_id NOT NULL (orphans attachments that belonged to kits)
    op.alter_column('attachments', 'part_id', nullable=False)
    op.create_foreign_key('attachments_part_id_fkey', 'attachments', 'parts', ['part_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_part_attachments_part_id', 'attachments', ['part_id'])

    # Restore cover_attachment_id on parts from attachment_sets
    connection.execute(
        sa.text("""
            UPDATE parts p
            SET cover_attachment_id = aset.cover_attachment_id
            FROM attachment_sets aset
            WHERE p.attachment_set_id = aset.id
        """)
    )

    # Drop new FK constraints and columns
    op.drop_constraint('fk_attachment_sets_cover', 'attachment_sets', type_='foreignkey')

    op.drop_index('ix_kits_attachment_set_id', 'kits')
    op.drop_constraint('fk_kits_attachment_set', 'kits', type_='foreignkey')
    op.drop_column('kits', 'attachment_set_id')

    op.drop_index('ix_parts_attachment_set_id', 'parts')
    op.drop_constraint('fk_parts_attachment_set', 'parts', type_='foreignkey')
    op.drop_column('parts', 'attachment_set_id')

    op.drop_index('ix_attachments_attachment_set_id', 'attachments')
    op.drop_constraint('fk_attachments_attachment_set', 'attachments', type_='foreignkey')
    op.drop_column('attachments', 'attachment_set_id')

    # Drop attachment_sets table
    op.drop_table('attachment_sets')

    # Rename attachments back to part_attachments
    op.rename_table('attachments', 'part_attachments')
