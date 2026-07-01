"""Persist chat ownership, settings, and feedback.

Revision ID: 0002_chat_realization
Revises: 0001_initial
Create Date: 2026-07-01
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002_chat_realization"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chat_sessions", sa.Column("user_id", sa.String(64), nullable=False, server_default="u-1001"))
    op.add_column("chat_sessions", sa.Column("temperature", sa.Float(), nullable=False, server_default="0.2"))
    op.add_column("chat_sessions", sa.Column("top_p", sa.Float(), nullable=False, server_default="0.9"))
    op.add_column("chat_sessions", sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="2048"))
    op.add_column("chat_sessions", sa.Column("recent_message_limit", sa.Integer(), nullable=False, server_default="8"))
    op.add_column("chat_sessions", sa.Column("show_thinking", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("chat_sessions", sa.Column("enable_thinking", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("chat_sessions", sa.Column("selected_knowledge_base_ids_json", sa.Text(), nullable=False, server_default="[]"))
    op.add_column("chat_sessions", sa.Column("attached_document_ids_json", sa.Text(), nullable=False, server_default="[]"))

    op.add_column("chat_messages", sa.Column("feedback", sa.String(20), nullable=True))
    op.add_column("chat_messages", sa.Column("feedback_reason", sa.Text(), nullable=True))
    op.add_column("chat_messages", sa.Column("feedback_updated_at", sa.String(40), nullable=True))
    op.add_column("chat_messages", sa.Column("edited_at", sa.String(40), nullable=True))
    op.add_column("chat_messages", sa.Column("regenerated_at", sa.String(40), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "regenerated_at")
    op.drop_column("chat_messages", "edited_at")
    op.drop_column("chat_messages", "feedback_updated_at")
    op.drop_column("chat_messages", "feedback_reason")
    op.drop_column("chat_messages", "feedback")

    op.drop_column("chat_sessions", "attached_document_ids_json")
    op.drop_column("chat_sessions", "selected_knowledge_base_ids_json")
    op.drop_column("chat_sessions", "enable_thinking")
    op.drop_column("chat_sessions", "show_thinking")
    op.drop_column("chat_sessions", "recent_message_limit")
    op.drop_column("chat_sessions", "max_tokens")
    op.drop_column("chat_sessions", "top_p")
    op.drop_column("chat_sessions", "temperature")
    op.drop_column("chat_sessions", "user_id")
