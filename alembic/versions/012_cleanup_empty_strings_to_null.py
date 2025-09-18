"""Cleanup empty strings to NULL

This migration dynamically converts all existing empty strings (including whitespace-only strings)
to NULL values across all String and Text columns in the database. This ensures data consistency
and prevents having both NULL and empty string values representing "no data".

Revision ID: 012
Revises: 011
Create Date: 2025-09-18 10:38:45.703896

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.sql.sqltypes import String, Text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '012'
down_revision: str | None = '011'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """
    Upgrade database schema.

    Dynamically converts all empty strings to NULL across all String and Text columns
    in the database. This ensures data consistency by eliminating mixed NULL/empty string
    states for "no value" conditions.
    """
    # Get database connection and inspector
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Iterate through all tables in the database
    for table_name in inspector.get_table_names():
        columns = inspector.get_columns(table_name)

        for column in columns:
            # Check if column is String or Text type
            # Skip ENUM and other special types that can't be processed with TRIM
            col_type = column['type']
            column_name = column['name']

            # Skip known ENUM columns and non-text types
            if (isinstance(col_type, String | Text) and
                not str(col_type).startswith('ENUM') and
                column_name != 'attachment_type'):  # Explicitly skip known ENUM column

                try:
                    # Convert all empty strings to NULL regardless of nullability
                    # If column is NOT NULL, existing SQLAlchemy constraints will apply
                    # Use TRIM to handle whitespace-only strings
                    # Only process if the column is actually nullable or has string content
                    op.execute(
                        sa.text(f"""
                            UPDATE {table_name}
                            SET {column_name} = NULL
                            WHERE {column_name} IS NOT NULL
                            AND TRIM({column_name}) = ''
                        """)
                    )
                except Exception as e:
                    # Skip columns that can't be processed (e.g., ENUMs misidentified as strings)
                    print(f"Skipping column {table_name}.{column_name}: {e}")
                    continue


def downgrade() -> None:
    """
    Downgrade database schema.

    No-op downgrade as rollback is not a concern for this pre-production application.
    Converting NULL back to empty strings would be counterproductive and could
    reintroduce the data consistency issues this migration resolves.
    """
    pass
