from datetime import date, timedelta
from io import BytesIO

import pytest
from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from backend.main import create_app


def save_payload(article, word="held", meaning="维持"):
    sentence = "The central bank held rates steady."
    return {
        "article_id": article["id"], "paragraph": 0, "surface": word,
        "sentence": sentence, "start": sentence.index(word), "meaning": meaning,
    }


def test_read_review_and_reopen(tmp_path):
    db = tmp_path / "reader.sqlite3"
    with TestClient(create_app(db)) as client:
        seeded_count = len(client.get("/api/articles").json())
        article = client.post("/api/articles", json={
            "title": "A short report", "author": "Student", "source": "Original",
            "body": "The central bank held rates steady. Officials met today.\n\nAnother paragraph follows.",
        }).json()
        article_id = article["id"]
        assert article["difficulty"]["word_count"] == 12
        assert client.get("/api/dictionary", params={"word": "held"}).json()["entry"]["word"] == "hold"
        assert client.get("/api/dictionary", params={"word": "rates"}).json()["entry"]["word"] == "rate"
        assert client.get("/api/dictionary", params={"word": "does"}).json()["entry"]["word"] == "do"
        payload = save_payload(article)
        word = client.post("/api/vocabulary", json=payload).json()
        repeated = client.post("/api/vocabulary", json=payload).json()
        assert repeated["id"] == word["id"]
        assert len(repeated["examples"]) == 1

        review = {"remembered": True, "due": word["due"], "streak": word["streak"]}
        result = client.post(f"/api/review/{word['id']}", json=review)
        assert result.status_code == 200
        assert result.json()["due"] == (date.today() + timedelta(days=2)).isoformat()
        assert client.post(f"/api/review/{word['id']}", json=review).status_code == 409
        assert client.get("/api/review").json() == []

        assert client.patch(f"/api/articles/{article_id}/progress", json={"paragraph": 999}).json() == {"paragraph": 1}
        for _ in range(2):
            assert client.post(f"/api/articles/{article_id}/complete").status_code == 200
        assert client.get("/api/activity").json()["entries"] == [
            {"day": date.today().isoformat(), "articles": 1, "reviews": 1},
        ]

    with TestClient(create_app(db)) as restarted:
        assert len(restarted.get("/api/articles").json()) == seeded_count + 1
        assert restarted.get(f"/api/articles/{article_id}").json()["paragraph"] == 1
        saved = restarted.get("/api/vocabulary").json()[0]
        assert saved["examples"][0]["surface"] == "held"
        assert saved["exams"] == ["雅思", "GRE"]
        assert restarted.get("/api/activity").json()["days"] == 1


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "db.sqlite3")) as test_client:
        yield test_client


def test_markdown_and_vocabulary_edit_delete(client):
    result = client.post("/api/articles", json={
        "title": "Report", "format": "md",
        "body": "The central bank **held** rates steady.\n\n> Read [the report](https://example.test).",
    })
    assert result.status_code == 201
    article = result.json()
    assert article["paragraphs"] == ["The central bank held rates steady.", "Read the report."]
    payload = save_payload(article)
    assert client.post("/api/vocabulary", json={**payload, "start": 0}).status_code == 422
    word = client.post("/api/vocabulary", json=payload).json()
    word_id = word["id"]
    assert client.patch(f"/api/vocabulary/{word_id}", json={"note": "政策利率", "status": "已掌握"}).json()["note"] == "政策利率"
    assert client.delete(f"/api/vocabulary/{word_id}").status_code == 204
    assert client.get("/api/vocabulary").json() == []
    assert client.get("/api/review").json() == []


def test_imported_articles_get_topic_covers_without_changing_their_category(client):
    examples = [
        ("Patients are waiting", "The debate covered trade, inflation and interest rates.", "健康与医疗"),
        ("A changing world", "Wildlife depends on biodiversity and healthy habitats.", "自然与环境"),
        ("Books about hospitals", "We look at a few different examples.", None),
    ]
    imported = {}
    for title, body, section in examples:
        response = client.post("/api/articles", json={"title": title, "body": body})
        assert response.status_code == 201
        article = response.json()
        assert article["category"] == "我的导入"
        assert article["cover_section"] == section
        imported[article["id"]] = section

    for article in client.get("/api/articles").json():
        assert article["cover_section"] == imported.get(article["id"], article["category"])


def test_mastered_word_changes_personal_difficulty(client):
    article = client.post("/api/articles", json={"title": "Urban shade", "body": "Infrastructure matters."}).json()
    original = article["difficulty"]
    assert "infrastructure" in original["rare_words"]
    word = client.post("/api/vocabulary", json={
        "article_id": article["id"], "paragraph": 0, "surface": "Infrastructure",
        "sentence": "Infrastructure matters.", "start": 0, "meaning": "基础设施",
    }).json()
    client.patch(f"/api/vocabulary/{word['id']}", json={"note": "", "status": "已掌握"})
    updated = client.get(f"/api/articles/{article['id']}").json()["difficulty"]
    assert updated["rare_ratio"] == original["rare_ratio"]
    assert updated["personal_ratio"] < original["personal_ratio"]


def test_title_lookup_and_answer_aware_scheduling(client):
    article = client.post("/api/articles", json={
        "title": "The bank held rates steady",
        "body": "The bank issued a statement.",
    }).json()
    assert article["difficulty"]["exam"] in {"四级", "六级", "雅思", "GRE"}
    entry = client.get("/api/dictionary", params={"word": "held"}).json()["entry"]
    assert len(entry["senses"]) > 1
    assert entry["english"]
    payload = {
        "article_id": article["id"], "paragraph": -1, "surface": "held",
        "sentence": article["title"], "start": article["title"].index("held"),
    }
    for rating, answer, meaning, correct, interval in (
        ("known", " HELD ", "维持", True, 2),
        ("fuzzy", "held", "保留", True, 1),
        ("forgot", "held", "握住", True, 1),
        ("known", "hold", "保持", False, 1),
    ):
        response = client.post("/api/vocabulary", json={**payload, "meaning": meaning})
        assert response.status_code == 201
        word = response.json()
        assert word["examples"][0]["paragraph"] == -1
        submission = {"rating": rating, "answer": answer, "due": word["due"], "streak": word["streak"]}
        result = client.post(f"/api/review/{word['id']}", json=submission)
        assert result.status_code == 200
        assert result.json()["correct"] is correct
        assert result.json()["interval_days"] == interval
        assert client.post(f"/api/review/{word['id']}", json=submission).status_code == 409


def test_recognized_phrases_can_be_looked_up_saved_and_spelled(client):
    title = "📰 As a result of new funding"
    sentence = "They carried out a study on interest rates."
    article = client.post("/api/articles", json={"title": title, "body": sentence}).json()
    assert article["phrases"] == [
        [{"start": title.index("As"), "surface": "As a result of", "first_occurrence": True}],
        [
            {"start": sentence.index("carried"), "surface": "carried out", "first_occurrence": True},
            {"start": sentence.index("interest"), "surface": "interest rates", "first_occurrence": True},
        ],
    ]
    entry = client.get("/api/dictionary", params={"word": "Carried  out"}).json()["entry"]
    assert entry["word"] == "carry out"
    assert entry["senses"][0]["meaning"] == "执行"
    save = {
        "article_id": article["id"], "paragraph": 0, "surface": "carried out",
        "sentence": sentence, "start": sentence.index("carried"), "meaning": "执行",
    }
    assert client.post("/api/vocabulary", json={**save, "start": 0}).status_code == 422
    word = client.post("/api/vocabulary", json=save).json()
    assert word["lemma"] == "carry out"
    assert word["examples"][0]["surface"] == "carried out"
    result = client.post(f"/api/review/{word['id']}", json={
        "rating": "known", "answer": "Carried   Out", "due": word["due"], "streak": word["streak"],
    })
    assert result.status_code == 200
    assert result.json()["correct"] is True


def test_duplicate_phrases_are_marked_once_per_article(client):
    payload = {
        "title": "Carry out a study",
        "body": "They carried out a study of interest rates. One interest rate changed.\n\nThey will carry out another study.",
    }
    for _ in range(2):
        article = client.post("/api/articles", json=payload).json()
        detail = client.get(f"/api/articles/{article['id']}").json()
        assert [[(match["surface"], match["first_occurrence"]) for match in block] for block in detail["phrases"]] == [
            [("Carry out", True)],
            [("carried out", False), ("interest rates", True), ("interest rate", False)],
            [("carry out", False)],
        ]


def test_article_translations_follow_paragraphs_and_persist(tmp_path):
    database = tmp_path / "translation.sqlite3"
    with TestClient(create_app(database)) as client:
        seeds = client.get("/api/articles").json()
        for seed in seeds:
            detail = client.get(f"/api/articles/{seed['id']}").json()
            assert len(detail["translation"]) == len(detail["paragraphs"]) > 0
        imported = client.post("/api/articles", json={"title": "A report", "body": "First paragraph.\n\nSecond paragraph."}).json()
        assert imported["translation"] == []
        path = f"/api/articles/{imported['id']}"
        assert client.patch(path + "/translation", json={"body": "只有一段。"}).status_code == 422
        response = client.patch(path + "/translation", json={"body": "第一段。\n\n第二段。"})
        assert response.json()["translation"] == ["第一段。", "第二段。"]
    with TestClient(create_app(database)) as client:
        assert client.get(path).json()["translation"] == ["第一段。", "第二段。"]
        assert client.patch(path + "/translation", json={"body": ""}).json()["translation"] == []


def test_editorial_materials_have_sources_and_cover_all_levels(client):
    articles = client.get("/api/articles").json()
    guides = [article for article in articles if article["material"] == "学习导读"]
    assert {article["source"] for article in guides} == {"China Daily", "The Economist", "The Times", "The Guardian"}
    assert all(article["source_url"].startswith("https://") for article in guides)
    assert {article["difficulty"]["exam"] for article in articles} == {"四级", "六级", "雅思", "GRE"}
    assert {(article["difficulty"]["exam"], article["difficulty"]["stars"]) for article in articles} == {
        ("四级", 1), ("四级", 2), ("六级", 3), ("雅思", 4), ("GRE", 5),
    }


def test_review_part_of_speech_follows_the_saved_meaning(client):
    sentence = "They water the plants."
    article = client.post("/api/articles", json={"title": "Gardening", "body": sentence}).json()
    senses = client.get("/api/dictionary", params={"word": "water"}).json()["entry"]["senses"]
    selections = [
        (next(sense["meaning"] for sense in senses if sense["pos"] == "n."), ["名词"]),
        (next(sense["meaning"] for sense in senses if sense["pos"] == "vt."), ["及物动词"]),
        ("我的自定义义项", []),
    ]
    for meaning, _ in selections:
        response = client.post("/api/vocabulary", json={
            "article_id": article["id"], "paragraph": 0, "surface": "water",
            "sentence": sentence, "start": sentence.index("water"), "meaning": meaning,
        })
        assert response.status_code == 201
    queue = client.get("/api/review").json()
    assert {word["meaning"]: word["parts_of_speech"] for word in queue} == dict(selections)


def test_docx_preview_preserves_order_and_only_saves_after_confirmation(client):
    document = Document()
    document.add_paragraph("A Word paragraph.")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Left"
    table.cell(0, 1).text = "Right"
    document.add_paragraph("The final paragraph.")
    content = BytesIO()
    document.save(content)

    before = client.get("/api/articles").json()
    preview = client.post("/api/articles/extract?format=docx", content=content.getvalue())
    assert preview.status_code == 200
    assert preview.json()["body"] == "A Word paragraph.\n\nLeft | Right\n\nThe final paragraph."
    assert client.get("/api/articles").json() == before

    imported = client.post("/api/articles", json={"title": "Word import", **preview.json()})
    assert imported.status_code == 201
    assert len(imported.json()["paragraphs"]) == 3


def set_pdf_page_text(page, text):
    name = NameObject
    page[name("/Resources")] = DictionaryObject({name("/Font"): DictionaryObject({
        name("/F1"): DictionaryObject({
            name("/Type"): name("/Font"), name("/Subtype"): name("/Type1"), name("/BaseFont"): name("/Helvetica"),
        }),
    })})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 20 380 Td (" + text.encode("ascii") + b") Tj ET")
    page.replace_contents(stream)


def test_pdf_preview_extracts_text_and_reports_missing_text(client):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=400)
    blank = BytesIO()
    writer.write(blank)
    result = client.post("/api/articles/extract?format=pdf", content=blank.getvalue())
    assert result.status_code == 422
    assert "扫描件" in result.json()["detail"]

    set_pdf_page_text(page, "This PDF has selectable text.")
    content = BytesIO()
    writer.write(content)
    result = client.post("/api/articles/extract?format=pdf", content=content.getvalue())
    assert result.status_code == 200
    assert result.json() == {"body": "This PDF has selectable text.", "articles": []}


def test_pdf_preview_splits_on_bookmarked_pages_and_keeps_full_preview(client):
    writer = PdfWriter()
    for text in ("Contents page", "Article A first page.", "Article A ends here.", "Article B starts here."):
        set_pdf_page_text(writer.add_blank_page(width=300, height=400), text)
    first = writer.add_outline_item("Article A", 1)
    writer.add_outline_item("A subsection", 2, parent=first)
    writer.add_outline_item("Article B", 3)
    content = BytesIO()
    writer.write(content)

    result = client.post("/api/articles/extract?format=pdf", content=content.getvalue()).json()
    assert result["body"].startswith("Contents page")
    assert result["articles"] == [
        {"title": "Article A", "body": "Article A first page.\n\nArticle A ends here."},
        {"title": "Article B", "body": "Article B starts here."},
    ]


@pytest.mark.parametrize("format", ["docx", "pdf"])
def test_malformed_document_reports_an_import_error(client, format):
    result = client.post(f"/api/articles/extract?format={format}", content=b"not a document")
    assert result.status_code == 422
    assert "无法读取该文件" in result.json()["detail"]


@pytest.mark.parametrize(("format", "content"), [
    ("txt", "The first report\n\nIt covers parks.\n---\nThe second report\n\nIt covers rivers."),
    ("md", "# The first report\n\nIt covers parks.\n\n## Details\n\n# The second report\n\nIt covers rivers."),
])
def test_import_preview_recognizes_article_boundaries(client, format, content):
    result = client.post(f"/api/articles/extract?format={format}", content=content.encode()).json()
    assert result["body"] == content
    assert [draft["title"] for draft in result["articles"]] == ["The first report", "The second report"]
    assert result["articles"][1]["body"] == "It covers rivers."


def test_docx_preview_uses_top_level_headings_without_splitting_subheadings(client):
    document = Document()
    document.add_heading("The first report", level=1)
    document.add_paragraph("It covers parks.")
    document.add_heading("Details", level=2)
    document.add_paragraph("There are many trees.")
    document.add_heading("The second report", level=1)
    document.add_paragraph("It covers rivers.")
    content = BytesIO()
    document.save(content)

    result = client.post("/api/articles/extract?format=docx", content=content.getvalue()).json()
    assert [draft["title"] for draft in result["articles"]] == ["The first report", "The second report"]
    assert "Details" in result["articles"][0]["body"]


def test_batch_confirmation_saves_all_articles_or_none(client):
    original = client.get("/api/articles").json()
    articles = [{"title": "First article", "body": "The first paragraph."}, {"title": "Second article", "body": "123"}]
    assert client.post("/api/articles/batch", json=articles).status_code == 422
    assert client.get("/api/articles").json() == original

    articles[1]["body"] = "The second paragraph."
    result = client.post("/api/articles/batch", json=articles)
    assert result.status_code == 201
    assert len(result.json()) == 2
    assert client.get("/api/articles").json()[-1]["title"] == "Second article"


def test_removed_article_stays_out_of_library_but_keeps_learning_records(tmp_path):
    database = tmp_path / "library.sqlite3"
    with TestClient(create_app(database)) as client:
        article = client.post("/api/articles", json={
            "title": "Test report", "body": "The central bank held rates steady.",
        }).json()
        article_id = article["id"]
        assert client.post("/api/vocabulary", json=save_payload(article)).status_code == 201
        assert client.post(f"/api/articles/{article_id}/complete").status_code == 200
        for _ in range(2):
            assert client.delete(f"/api/articles/{article_id}").status_code == 204

    with TestClient(create_app(database)) as restarted:
        assert all(article["id"] != article_id for article in restarted.get("/api/articles").json())
        assert restarted.get("/api/review").json()[0]["examples"][0]["article_id"] == article_id
        assert restarted.get(f"/api/articles/{article_id}").status_code == 200
        assert restarted.get("/api/activity").json()["articles"] == 1
