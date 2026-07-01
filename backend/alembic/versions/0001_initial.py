"""Initial backend schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-29
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def enum(*values: str) -> sa.Enum:
    return sa.Enum(*values, native_enum=False)


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", enum("普通用户", "科研人员", "知识库管理员", "授权管理员", "安全审计员", "运维账号"), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("department", sa.String(100), nullable=False),
        sa.Column("role_id", sa.String(64), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("ip", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "model_configs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("status", enum("正常", "已下线"), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("department", sa.String(100), nullable=False),
        sa.Column("level", enum("公开级", "内部级", "私有"), nullable=False),
        sa.Column("file_count", sa.Integer(), nullable=False),
        sa.Column("status", enum("已索引", "索引中", "待审核", "未索引"), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("role", enum("所有者", "管理员", "查看者"), nullable=False),
        sa.Column("type", enum("个人库", "部门库", "授权库"), nullable=False),
    )
    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("knowledge_base_id", sa.String(64), sa.ForeignKey("knowledge_bases.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("status", enum("待审核", "已入库", "已驳回", "已拦截"), nullable=False),
        sa.Column("security_result", enum("通过", "疑似涉密", "待检测"), nullable=False),
        sa.Column("applicant", sa.String(100), nullable=False),
        sa.Column("submitted_at", sa.String(40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
    )
    op.create_table(
        "approvals",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("type", enum("文件入库", "知识库授权", "模型权限", "API 权限"), nullable=False),
        sa.Column("applicant", sa.String(100), nullable=False),
        sa.Column("target", sa.String(255), nullable=False),
        sa.Column("status", enum("待审批", "已通过", "已驳回"), nullable=False),
        sa.Column("risk", enum("无风险", "中风险", "高风险"), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("related_document_id", sa.String(64), sa.ForeignKey("knowledge_documents.id"), nullable=True),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("time", sa.String(40), nullable=False),
        sa.Column("user", sa.String(100), nullable=False),
        sa.Column("role", enum("普通用户", "科研人员", "知识库管理员", "授权管理员", "安全审计员", "运维账号"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource", sa.String(255), nullable=False),
        sa.Column("ip", sa.String(64), nullable=False),
        sa.Column("risk", enum("normal", "warning", "danger"), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
    )
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("chat_sessions.id"), nullable=False),
        sa.Column("role", enum("user", "assistant"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("citations_json", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("audit_logs")
    op.drop_table("approvals")
    op.drop_table("knowledge_documents")
    op.drop_table("knowledge_bases")
    op.drop_table("model_configs")
    op.drop_table("users")
    op.drop_table("roles")
