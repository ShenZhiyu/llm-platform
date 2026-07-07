"""SQLAlchemy 声明式基类。所有 ORM Model 都继承该 Base。"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """项目 ORM 模型基类。"""

    pass
