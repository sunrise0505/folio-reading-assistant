import json
import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import create_engine, delete, event, func, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .document_import import (
    MAX_ARTICLE_LENGTH, MAX_FILE_BYTES, MAX_TEXT_FILE_BYTES, DocumentFormat, DocumentImportError, ExtractionMode, extract_document,
)
from .models import Activity, Article, ArticleTranslation, Base, Example, RemovedArticle, Vocabulary
from .reading import (
    DATA_DIR, EXPRESSION, WORD, difficulty, entry_details, exam_memberships, lookup, normalize, parts_of_speech,
    plain_markdown, recognize_phrases, split_paragraphs, suggest_cover_section,
)

ROOT = Path(__file__).resolve().parents[1]
Text = Annotated[str, StringConstraints(strip_whitespace=True)]
Status = Literal["学习中", "已掌握"]


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class ArticleInput(Input):
    title: Text = Field(min_length=1, max_length=180)
    body: Text = Field(min_length=1, max_length=MAX_ARTICLE_LENGTH)
    author: Text = Field(default="", max_length=150)
    source: Text = Field(default="", max_length=500)
    format: Literal["txt", "md"] = "txt"


class ProgressInput(Input):
    paragraph: int = Field(ge=0)


class TranslationInput(Input):
    body: Text = Field(max_length=MAX_ARTICLE_LENGTH)


class SaveWord(Input):
    article_id: int
    paragraph: int = Field(ge=-1)
    surface: Text = Field(min_length=1, max_length=80)
    sentence: Text = Field(min_length=1, max_length=100_000)
    start: int = Field(ge=0)
    meaning: Text = Field(min_length=1, max_length=1000)


class EditWord(Input):
    note: Text = Field(max_length=1500)
    status: Status


class ReviewInput(Input):
    remembered: bool | None = None
    rating: Literal["known", "fuzzy", "forgot"] | None = None
    answer: Text = Field(default="", max_length=180)
    due: date
    streak: int = Field(ge=0)

    @model_validator(mode="after")
    def require_rating(self):
        if (self.remembered is None) == (self.rating is None):
            raise ValueError("请提交一个复习评分。")
        return self


def create_app(database: Path | None = None) -> FastAPI:
    database = database or Path(os.environ.get("READING_DB_PATH", ROOT / "data" / "reading.sqlite3"))
    engine = create_engine(URL.create("sqlite", database=str(database.resolve())))

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys = ON")

    materials = json.loads((DATA_DIR / "articles.json").read_text(encoding="utf-8"))
    reading_sources = {item["slug"]: item["source_url"] for item in materials if "source_url" in item}
    translations = json.loads((DATA_DIR / "article_translations.json").read_text(encoding="utf-8"))

    @asynccontextmanager
    async def lifespan(_):
        database.parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            for article in materials:
                fields = {key: value for key, value in article.items() if key != "source_url"}
                session.execute(insert(Article).values(**fields).on_conflict_do_nothing(index_elements=["slug"]))
            session.commit()
        yield
        engine.dispose()

    app = FastAPI(title="拾页 FOLIO", lifespan=lifespan)

    @app.middleware("http")
    async def local_api(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.url.hostname not in {
            "localhost", "127.0.0.1", "::1", "testserver"
        }:
            return JSONResponse({"detail": "请通过本机地址访问。"}, status_code=403)
        if request.method in {"POST", "PATCH", "DELETE"} and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and origin not in {
                f"{request.url.scheme}://{request.url.netloc}", "http://127.0.0.1:5173", "http://localhost:5173"
            }:
                return JSONResponse({"detail": "请求来源无效。"}, status_code=403)
        return await call_next(request)

    def get_db():
        with Session(engine) as session:
            yield session

    DB = Annotated[Session, Depends(get_db)]

    def require_article(session: Session, article_id: int) -> Article:
        article = session.get(Article, article_id)
        if article is None:
            raise HTTPException(404, "找不到这篇文章。")
        return article

    def require_word(session: Session, word_id: int) -> Vocabulary:
        word = session.get(Vocabulary, word_id)
        if word is None:
            raise HTTPException(404, "找不到这个生词。")
        return word

    def mastered_words(session: Session) -> set[str]:
        return set(session.scalars(
            select(Vocabulary.lemma)
            .group_by(Vocabulary.lemma)
            .having(func.count() == func.count().filter(Vocabulary.status == "已掌握"))
        ))

    def article_json(article: Article, mastered: set[str]) -> dict:
        cover_section = suggest_cover_section(article.title, article.body[:8000]) if article.category == "我的导入" else article.category
        result = {
            "id": article.id, "title": article.title, "subtitle": article.subtitle, "category": article.category,
            "author": article.author, "source": article.source, "paragraph": article.paragraph,
            "cover_section": cover_section,
            "source_url": reading_sources.get(article.slug),
            "material": "学习导读" if article.slug in reading_sources else "原创样文" if article.slug else "用户导入",
            "completed_on": article.completed_on, "difficulty": difficulty(article.body, mastered),
        }
        return result

    def article_detail(session: Session, article: Article) -> dict:
        result = article_json(article, mastered_words(session))
        paragraphs = split_paragraphs(article.body)
        stored = session.get(ArticleTranslation, article.id)
        translated = split_paragraphs(stored.body) if stored else translations.get(article.slug, [])
        seen_phrases: set[str] = set()
        return {
            **result,
            "paragraphs": paragraphs,
            "translation": translated if len(translated) == len(paragraphs) else [],
            "phrases": [recognize_phrases(text, seen_phrases) for text in [article.title, *paragraphs]],
        }

    def word_json(session: Session, word: Vocabulary) -> dict:
        examples = session.execute(
            select(Example, Article.title).join(Article).where(Example.vocabulary_id == word.id).order_by(Example.id)
        ).all()
        return {
            "id": word.id, "lemma": word.lemma, "meaning": word.meaning, "note": word.note,
            "parts_of_speech": parts_of_speech(word.lemma, word.meaning), "exams": exam_memberships(word.lemma),
            "status": word.status, "due": word.due, "streak": word.streak,
            "examples": [
                {"article_id": ex.article_id, "title": title, "paragraph": ex.paragraph,
                 "surface": ex.surface, "sentence": ex.sentence, "start": ex.start}
                for ex, title in examples
            ],
        }

    def record(session: Session, today: str, field: str):
        column = getattr(Activity, field)
        session.execute(
            insert(Activity).values(day=today, **{field: 1}).on_conflict_do_update(
                index_elements=["day"], set_={field: column + 1}
            )
        )

    @app.get("/api/articles")
    def articles(session: DB):
        mastered = mastered_words(session)
        visible = select(Article).where(Article.id.not_in(select(RemovedArticle.article_id))).order_by(Article.id)
        return [article_json(article, mastered) for article in session.scalars(visible)]

    def article_from_input(payload: ArticleInput) -> Article:
        body = plain_markdown(payload.body) if payload.format == "md" else payload.body
        if not WORD.search(body):
            raise HTTPException(422, "请导入包含英文单词的正文。")
        return Article(title=payload.title, body=body, author=payload.author, source=payload.source)

    @app.post("/api/articles", status_code=201)
    def import_article(payload: ArticleInput, session: DB):
        article = article_from_input(payload)
        session.add(article)
        session.commit()
        return article_detail(session, article)

    @app.post("/api/articles/batch", status_code=201)
    def import_articles(payload: Annotated[list[ArticleInput], Field(min_length=1)], session: DB):
        articles = [article_from_input(item) for item in payload]
        session.add_all(articles)
        session.commit()
        return [{"id": article.id} for article in articles]

    @app.post("/api/articles/extract")
    async def extract_article(request: Request, format: DocumentFormat, mode: ExtractionMode = "auto"):
        is_text = format in {"txt", "md"}
        size_limit = MAX_TEXT_FILE_BYTES if is_text else MAX_FILE_BYTES
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > size_limit:
                message = "请选择 400 KB 以内的 TXT 或 Markdown 文件。" if is_text else "请选择 10 MB 以内的 DOCX 或 PDF 文件。"
                raise HTTPException(413, message)
            data.extend(chunk)
        try:
            return await run_in_threadpool(extract_document, data, format, mode)
        except DocumentImportError as error:
            raise HTTPException(422, str(error)) from error

    @app.get("/api/articles/{article_id}")
    def get_article(article_id: int, session: DB):
        return article_detail(session, require_article(session, article_id))

    @app.patch("/api/articles/{article_id}/translation")
    def edit_translation(article_id: int, payload: TranslationInput, session: DB):
        article = require_article(session, article_id)
        translated = split_paragraphs(payload.body)
        paragraphs = split_paragraphs(article.body)
        if translated and len(translated) != len(paragraphs):
            raise HTTPException(422, f"原文有 {len(paragraphs)} 段，译文有 {len(translated)} 段。请用空行分段并与原文对应。")
        if translated:
            values = {"article_id": article_id, "body": payload.body}
            session.execute(insert(ArticleTranslation).values(**values).on_conflict_do_update(
                index_elements=["article_id"], set_={"body": payload.body},
            ))
        else:
            session.execute(delete(ArticleTranslation).where(ArticleTranslation.article_id == article_id))
        session.commit()
        return article_detail(session, article)

    @app.delete("/api/articles/{article_id}", status_code=204)
    def remove_article(article_id: int, session: DB):
        require_article(session, article_id)
        session.execute(insert(RemovedArticle).values(article_id=article_id).on_conflict_do_nothing())
        session.commit()

    @app.patch("/api/articles/{article_id}/progress")
    def save_progress(article_id: int, payload: ProgressInput, session: DB):
        article = require_article(session, article_id)
        article.paragraph = min(payload.paragraph, len(split_paragraphs(article.body)) - 1)
        session.commit()
        return {"paragraph": article.paragraph}

    @app.post("/api/articles/{article_id}/complete")
    def complete(article_id: int, session: DB):
        require_article(session, article_id)
        today = date.today().isoformat()
        changed = session.execute(
            update(Article).where(Article.id == article_id, Article.completed_on.is_(None)).values(completed_on=today)
        )
        if changed.rowcount:
            record(session, today, "articles")
        session.commit()
        return article_detail(session, require_article(session, article_id))

    @app.get("/api/dictionary")
    def dictionary_entry(word: Annotated[str, Query(min_length=1, max_length=80)]):
        entry = lookup(word)
        return {"entry": {**asdict(entry), **entry_details(entry)} if entry else None}

    @app.get("/api/vocabulary")
    def vocabulary(session: DB):
        return [word_json(session, word) for word in session.scalars(select(Vocabulary).order_by(Vocabulary.id.desc()))]

    @app.post("/api/vocabulary", status_code=201)
    def save_word(payload: SaveWord, session: DB):
        article = require_article(session, payload.article_id)
        paragraphs = split_paragraphs(article.body)
        context = article.title if payload.paragraph == -1 else (
            paragraphs[payload.paragraph] if payload.paragraph < len(paragraphs) else ""
        )
        if (
            not EXPRESSION.fullmatch(payload.surface) or payload.sentence not in context
            or payload.sentence[payload.start:payload.start + len(payload.surface)] != payload.surface
        ):
            raise HTTPException(422, "原句与所选单词或短语不匹配。")
        entry = lookup(payload.surface)
        lemma = entry.word if entry else normalize(payload.surface)
        session.execute(
            insert(Vocabulary).values(lemma=lemma, meaning=payload.meaning, due=date.today().isoformat())
            .on_conflict_do_nothing(index_elements=["lemma", "meaning"])
        )
        word = session.scalar(select(Vocabulary).where(Vocabulary.lemma == lemma, Vocabulary.meaning == payload.meaning))
        session.execute(
            insert(Example).values(vocabulary_id=word.id, **payload.model_dump(exclude={"meaning"}))
            .on_conflict_do_nothing()
        )
        session.commit()
        return word_json(session, word)

    @app.patch("/api/vocabulary/{word_id}")
    def edit_word(word_id: int, payload: EditWord, session: DB):
        word = require_word(session, word_id)
        if word.status != payload.status and payload.status == "学习中":
            word.due = date.today().isoformat()
            word.streak = 0
        word.note = payload.note
        word.status = payload.status
        session.commit()
        return word_json(session, word)

    @app.delete("/api/vocabulary/{word_id}", status_code=204)
    def remove_word(word_id: int, session: DB):
        session.execute(delete(Vocabulary).where(Vocabulary.id == word_id))
        session.commit()

    @app.get("/api/review")
    def review_queue(session: DB):
        today = date.today().isoformat()
        queue = session.scalars(
            select(Vocabulary).where(Vocabulary.due <= today).order_by(Vocabulary.due, Vocabulary.id)
        )
        return [word_json(session, word) for word in queue]

    @app.post("/api/review/{word_id}")
    def review(word_id: int, payload: ReviewInput, session: DB):
        word = require_word(session, word_id)
        today = date.today()
        if payload.rating is None:
            correct = None
            rating = "known" if payload.remembered else "forgot"
        else:
            example = session.scalar(select(Example).where(Example.vocabulary_id == word.id).order_by(Example.id).limit(1))
            expected = example.surface if example else word.lemma
            correct = normalize(payload.answer) == normalize(expected)
            rating = payload.rating if correct else "forgot"

        intervals = (1, 2, 4, 7, 14, 30)
        if rating == "known":
            streak = payload.streak + 1
            interval = intervals[min(streak, len(intervals) - 1)]
        elif rating == "fuzzy":
            streak = max(0, payload.streak - 1)
            interval = 2 if streak >= 2 else 1
        else:
            streak, interval = 0, 1
        changed = session.execute(
            update(Vocabulary).where(
                Vocabulary.id == word.id, Vocabulary.due == payload.due.isoformat(),
                Vocabulary.streak == payload.streak, Vocabulary.due <= today.isoformat()
            ).values(
                streak=streak, due=(today + timedelta(days=interval)).isoformat(),
                status="已掌握" if streak >= 3 else "学习中",
            )
        )
        if not changed.rowcount:
            raise HTTPException(409, "这张卡片已更新，请刷新复习列表。")
        record(session, today.isoformat(), "reviews")
        session.commit()
        return {**word_json(session, word), "correct": correct, "interval_days": interval}

    @app.get("/api/activity")
    def activity(session: DB):
        rows = session.scalars(select(Activity).order_by(Activity.day)).all()
        return {
            "today": date.today().isoformat(), "days": len(rows),
            "articles": sum(row.articles for row in rows), "reviews": sum(row.reviews for row in rows),
            "entries": [{"day": row.day, "articles": row.articles, "reviews": row.reviews} for row in rows],
        }

    dist = ROOT / "frontend" / "dist"
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        if not (dist / "index.html").is_file():
            raise HTTPException(503, "请先执行 npm --prefix frontend run build。")
        return FileResponse(dist / "index.html")

    return app


app = create_app()
