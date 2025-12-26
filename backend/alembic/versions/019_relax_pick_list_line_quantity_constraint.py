"""relax pick list line quantity constraint to allow zero

Revision ID: 019
Revises: 018
Create Date: 2025-12-26 12:51:03.916458

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade database schema."""
    # Drop old constraint that required >= 1
    op.drop_constraint(
        'ck_pick_list_lines_quantity_positive',
        'kit_pick_list_lines',
        type_='check',
    )

    # Add new constraint that allows >= 0
    op.create_check_constraint(
        'ck_pick_list_lines_quantity_positive',
        'kit_pick_list_lines',
        'quantity_to_pick >= 0',
    )


def downgrade() -> None:
    """Downgrade database schema."""
    # Drop relaxed constraint
    op.drop_constraint(
        'ck_pick_list_lines_quantity_positive',
        'kit_pick_list_lines',
        type_='check',
    )

    # Restore original constraint requiring >= 1
    op.create_check_constraint(
        'ck_pick_list_lines_quantity_positive',
        'kit_pick_list_lines',
        'quantity_to_pick >= 1',
    )
