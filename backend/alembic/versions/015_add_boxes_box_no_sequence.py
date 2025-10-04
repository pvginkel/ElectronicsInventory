"""Add sequence for box numbers

Revision ID: 015
Revises: 014
Create Date: 2025-03-09 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015"
down_revision: str | None = "014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEQUENCE_NAME = "boxes_box_no_seq"


def upgrade() -> None:
    """Create sequence and attach it to boxes.box_no."""
    op.execute(
        sa.text(
            "CREATE SEQUENCE IF NOT EXISTS "
            f"{SEQUENCE_NAME} START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1"
        )
    )
    op.execute(sa.text(f"ALTER SEQUENCE {SEQUENCE_NAME} OWNED BY boxes.box_no"))

    op.alter_column(
        "boxes",
        "box_no",
        server_default=sa.text(f"nextval('{SEQUENCE_NAME}')"),
        existing_type=sa.Integer(),
        existing_nullable=False,
    )

    op.execute(
        sa.text(
            "SELECT setval("  # noqa: S608 - sequence name is controlled constant
            "   :seq_name,"
            "   COALESCE(MAX(box_no), 1),"
            "   CASE WHEN MAX(box_no) IS NULL THEN false ELSE true END"
            ") FROM boxes"
        ).bindparams(seq_name=SEQUENCE_NAME)
    )


def downgrade() -> None:
    """Remove sequence default from boxes.box_no and drop the sequence."""
    op.alter_column(
        "boxes",
        "box_no",
        server_default=None,
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.execute(sa.text(f"ALTER SEQUENCE {SEQUENCE_NAME} OWNED BY NONE"))
    op.execute(sa.text(f"DROP SEQUENCE IF EXISTS {SEQUENCE_NAME}"))
