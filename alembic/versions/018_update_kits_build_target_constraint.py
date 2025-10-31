"""Relax kit build target constraint to allow zero.

Revision ID: 018
Revises: 017
Create Date: 2026-05-08 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Allow kits to persist a zero build target."""
    op.drop_constraint(
        "ck_kits_build_target_positive",
        "kits",
        type_="check",
    )
    op.create_check_constraint(
        "ck_kits_build_target_non_negative",
        "kits",
        "build_target >= 0",
    )


def downgrade() -> None:
    """Restore requirement that kits have a strictly positive build target."""
    op.drop_constraint(
        "ck_kits_build_target_non_negative",
        "kits",
        type_="check",
    )
    op.create_check_constraint(
        "ck_kits_build_target_positive",
        "kits",
        "build_target >= 1",
    )

