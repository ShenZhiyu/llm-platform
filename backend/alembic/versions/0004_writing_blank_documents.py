"""Allow intelligent writing documents without templates.

Revision ID: 0004_writing_blank_documents
Revises: 0003_writing_module
Create Date: 2026-07-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0004_writing_blank_documents"
down_revision: str | None = "0003_writing_module"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("writing_documents") as batch_op:
        batch_op.alter_column(
            "template_id",
            existing_type=sa.String(length=64),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("writing_documents") as batch_op:
        batch_op.alter_column(
            "template_id",
            existing_type=sa.String(length=64),
            nullable=False,
        )
