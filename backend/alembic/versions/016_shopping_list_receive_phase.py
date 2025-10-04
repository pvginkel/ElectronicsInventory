"""Add completion metadata and receive indexes

Revision ID: 016
Revises: 015
Create Date: 2025-12-05 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


LINE_STATUS_DONE = "done"


def upgrade() -> None:
    """Add completion metadata fields and supporting indexes."""
    op.add_column(
        "shopping_list_lines",
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "shopping_list_lines",
        sa.Column(
            "completion_mismatch",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "shopping_list_lines",
        sa.Column("completion_note", sa.Text(), nullable=True),
    )

    op.create_index(
        "ix_shopping_list_lines_list_status",
        "shopping_list_lines",
        ["shopping_list_id", "status"],
    )
    op.create_index(
        "ix_shopping_list_lines_list_received",
        "shopping_list_lines",
        ["shopping_list_id", "received"],
    )

    op.execute(
        sa.text(
            "UPDATE shopping_list_lines "
            "SET completed_at = COALESCE(updated_at, CURRENT_TIMESTAMP) "
            "WHERE status = :done_status"
        ).bindparams(done_status=LINE_STATUS_DONE)
    )


def downgrade() -> None:
    """Remove completion metadata fields and indexes."""
    op.drop_index(
        "ix_shopping_list_lines_list_received",
        table_name="shopping_list_lines",
    )
    op.drop_index(
        "ix_shopping_list_lines_list_status",
        table_name="shopping_list_lines",
    )

    op.drop_column("shopping_list_lines", "completion_note")
    op.drop_column("shopping_list_lines", "completion_mismatch")
    op.drop_column("shopping_list_lines", "completed_at")
