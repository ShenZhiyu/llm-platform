"""Add intelligent writing templates and documents.

Revision ID: 0003_writing_module
Revises: 0002_chat_realization
Create Date: 2026-07-06
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0003_writing_module"
down_revision: str | None = "0002_chat_realization"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "writing_templates",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("category", sa.String(80), nullable=False, server_default="通用模板"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("owner_id", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("original_file_name", sa.String(255), nullable=False),
        sa.Column("original_file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_hash", sa.String(128), nullable=True),
        sa.Column("fields_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("format_config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("preview_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "writing_template_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("template_id", sa.String(64), sa.ForeignKey("writing_templates.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_hash", sa.String(128), nullable=True),
        sa.Column("fields_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("format_config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "writing_documents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("template_id", sa.String(64), sa.ForeignKey("writing_templates.id"), nullable=False),
        sa.Column("owner_id", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("status", sa.String(40), nullable=False, server_default="draft"),
        sa.Column("content_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("format_config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("current_file_path", sa.String(500), nullable=True),
        sa.Column("current_file_hash", sa.String(128), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "writing_document_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("document_id", sa.String(64), sa.ForeignKey("writing_documents.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("content_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("format_config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("docx_path", sa.String(500), nullable=False),
        sa.Column("file_hash", sa.String(128), nullable=True),
        sa.Column("created_by", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "writing_ai_operations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("document_id", sa.String(64), sa.ForeignKey("writing_documents.id"), nullable=False),
        sa.Column("operation_type", sa.String(60), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False, server_default=""),
        sa.Column("input_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("output_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("model", sa.String(100), nullable=False, server_default=""),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("writing_ai_operations")
    op.drop_table("writing_document_versions")
    op.drop_table("writing_documents")
    op.drop_table("writing_template_versions")
    op.drop_table("writing_templates")
