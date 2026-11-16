from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str | None] = mapped_column(unique=True)
    title: Mapped[str]
    subtitle: Mapped[str] = mapped_column(default="")
    category: Mapped[str] = mapped_column(default="我的导入")
    author: Mapped[str] = mapped_column(default="")
    source: Mapped[str] = mapped_column(default="")
    body: Mapped[str]
    paragraph: Mapped[int] = mapped_column(default=0)
    completed_on: Mapped[str | None]


class RemovedArticle(Base):
    __tablename__ = "removed_articles"

    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True)


class ArticleTranslation(Base):
    __tablename__ = "article_translations"

    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True)
    body: Mapped[str]


class Vocabulary(Base):
    __tablename__ = "vocabulary"
    __table_args__ = (UniqueConstraint("lemma", "meaning"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lemma: Mapped[str]
    meaning: Mapped[str]
    note: Mapped[str] = mapped_column(default="")
    status: Mapped[str] = mapped_column(default="学习中")
    streak: Mapped[int] = mapped_column(default=0)
    due: Mapped[str] = mapped_column(String(10))


class Example(Base):
    __tablename__ = "examples"
    __table_args__ = (UniqueConstraint("vocabulary_id", "article_id", "paragraph", "sentence", "start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    vocabulary_id: Mapped[int] = mapped_column(ForeignKey("vocabulary.id", ondelete="CASCADE"))
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id"))
    paragraph: Mapped[int]
    surface: Mapped[str]
    sentence: Mapped[str]
    start: Mapped[int]


class Activity(Base):
    __tablename__ = "activities"

    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    articles: Mapped[int] = mapped_column(default=0)
    reviews: Mapped[int] = mapped_column(default=0)
