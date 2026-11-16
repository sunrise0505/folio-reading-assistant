import re
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from io import BytesIO
from typing import Literal
from zipfile import BadZipFile, ZipFile

from docx import Document
from docx.opc.exceptions import PackageNotFoundError
from docx.text.paragraph import Paragraph
from lxml.etree import XMLSyntaxError
from pypdf import PdfReader
from pypdf.errors import PyPdfError
from pypdf.generic import Destination

from .reading import WORD

DocumentFormat = Literal["txt", "md", "docx", "pdf"]
MAX_FILE_BYTES = 10_000_000
MAX_TEXT_FILE_BYTES = 400_000
MAX_ARTICLE_LENGTH = 100_000
MAX_PDF_PAGES = 100
MAX_EXPANDED_DOCX_BYTES = 40_000_000
TITLE = re.compile(r"^(?:Title\s*[:：]\s*|标题\s*[:：]\s*)(.+)$", re.IGNORECASE)
MARKDOWN_TITLE = re.compile(r"^#(?!#)\s+(.+?)\s*#*$")
SEPARATOR = re.compile(r"^(?:-{3,}|={3,})$")


class DocumentImportError(ValueError):
    pass


@dataclass(frozen=True)
class Block:
    text: str
    title: str = ""
    separator: bool = False


def text_blocks(source: str, *, markdown: bool = False) -> Iterator[Block]:
    lines = []
    for line in source.splitlines():
        stripped = line.strip()
        title = TITLE.fullmatch(stripped) or (MARKDOWN_TITLE.fullmatch(stripped) if markdown else None)
        separator = bool(SEPARATOR.fullmatch(stripped))
        if stripped and not title and not separator:
            lines.append(line)
            continue
        if lines:
            yield Block("\n".join(lines).strip())
            lines.clear()
        if stripped:
            yield Block(stripped, title[1].strip() if title else "", separator)
    if lines:
        yield Block("\n".join(lines).strip())


def docx_blocks(source: BytesIO) -> Iterator[Block]:
    with ZipFile(source) as archive:
        if sum(item.file_size for item in archive.infolist()) > MAX_EXPANDED_DOCX_BYTES:
            raise DocumentImportError("DOCX 解压后过大，请拆成较小的文档再上传。")
    source.seek(0)
    document = Document(source)
    for block in document.iter_inner_content():
        if isinstance(block, Paragraph):
            if block.text.strip() and block.style and block.style.style_id in {"Title", "Heading1"}:
                title = " ".join(block.text.split())
                yield Block(title, title)
            else:
                yield from text_blocks(block.text)
        else:
            for row in block.rows:
                cells = [cell.text.strip() for cell in row.cells]
                text = " | ".join(cell for cell in cells if cell)
                if text:
                    yield Block(text)


def pdf_preview(source: BytesIO) -> dict:
    reader = PdfReader(source)
    if reader.is_encrypted:
        raise DocumentImportError("PDF 有加密保护，请上传解除保护的副本。")
    if len(reader.pages) > MAX_PDF_PAGES:
        raise DocumentImportError(f"PDF 超过 {MAX_PDF_PAGES} 页，请拆分后上传。")
    pages = []
    length = 0
    for page in reader.pages:
        text = page.extract_text(extraction_mode="layout") or page.extract_text()
        blocks = list(text_blocks(text))
        length += sum(len(" ".join(block.text.split())) + 2 for block in blocks)
        if length > MAX_ARTICLE_LENGTH + 2:
            raise DocumentImportError("提取的正文超过 10 万字符，请拆分后上传。")
        pages.append(blocks)

    preview = assemble_preview((block for page in pages for block in page), "pdf")
    bookmarked = bookmarked_articles(reader, pages)
    if bookmarked:
        preview["articles"] = bookmarked
    return preview


def bookmarked_articles(reader: PdfReader, pages: list[list[Block]]) -> list[dict[str, str]]:
    try:
        bookmarks = [entry for entry in reader.outline if isinstance(entry, Destination)]
        starts = [reader.get_destination_page_number(entry) for entry in bookmarks]
        titles = [" ".join(entry.title.split()) for entry in bookmarks]
    except (PyPdfError, ValueError, KeyError, TypeError, IndexError):
        return []
    if len(starts) < 2 or any(start is None or not 0 <= start < len(pages) for start in starts):
        return []
    if starts != sorted(set(starts)) or not all(titles):
        return []

    first_blocks = Counter(" ".join(page[0].text.split()) for page in pages if page)
    articles = []
    for title, start, end in zip(titles, starts, starts[1:] + [len(pages)]):
        title_key = re.sub(r"\W", "", title.casefold())
        parts = []
        for page_index in range(start, end):
            lines = [" ".join(block.text.split()) for block in pages[page_index]]
            if lines and first_blocks[lines[0]] > len(pages) / 2 and len(lines[0]) < 180:
                lines.pop(0)
            if lines and re.fullmatch(rf"{page_index + 1}\s*/\s*{len(pages)}", lines[-1]):
                lines.pop()
            if page_index == start:
                for index, line in enumerate(lines[:8]):
                    if title_key and re.sub(r"\W", "", line.casefold()) == title_key:
                        lines = lines[index + 1:]
                        break
            parts.extend(lines)
        body = "\n\n".join(parts)
        if not WORD.search(body):
            return []
        articles.append({"title": title[:180], "body": body})
    return articles


def guess_title(block: Block) -> str:
    if block.title:
        return block.title
    first_line = block.text.strip()
    if "\n" not in first_line and len(first_line) <= 180 and len(WORD.findall(first_line)) in range(1, 19):
        if not first_line.endswith((".", "!", ";", "。", "！")):
            return first_line
    return ""


def suggest_articles(blocks: list[Block]) -> list[dict[str, str]]:
    groups: list[list[Block]] = [[]]
    for block in blocks:
        if block.separator and groups[-1]:
            groups.append([])
        elif not block.separator:
            groups[-1].append(block)
    sections = [group for group in groups if group]
    if len(sections) == 1:
        sections = [blocks]
        if blocks[0].title:
            sections = []
            for block in blocks:
                if block.title:
                    sections.append([])
                sections[-1].append(block)

    drafts = []
    for section in sections:
        title = guess_title(section[0])
        body = "\n\n".join(block.text for block in section[1:]).strip()
        if not title or not WORD.search(body):
            return []
        drafts.append({"title": title[:180], "body": body})
    return drafts


def assemble_preview(blocks: Iterable[Block], format: DocumentFormat) -> dict:
    parts = []
    length = 0
    for block in blocks:
        text = " ".join(block.text.split()) if format in {"docx", "pdf"} else block.text
        if not text:
            continue
        length += len(text) + (2 if parts else 0)
        if length > MAX_ARTICLE_LENGTH:
            raise DocumentImportError("提取的正文超过 10 万字符，请拆分后上传。")
        parts.append(Block(text, block.title, block.separator))
    body = "\n\n".join(block.text for block in parts)
    if not WORD.search(body):
        if format == "pdf":
            raise DocumentImportError("PDF 中没有可提取的英文正文。扫描件请先转换成可选中文字的 PDF。")
        raise DocumentImportError("文件中没有可提取的英文正文。")
    return {"body": body, "articles": suggest_articles(parts)}


def extract_document(data: bytearray, format: DocumentFormat) -> dict:
    if format in {"txt", "md"}:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise DocumentImportError("无法读取文本文件，请确认文件为 UTF-8 编码。") from error
        if len(text) > MAX_ARTICLE_LENGTH:
            raise DocumentImportError("提取的正文超过 10 万字符，请拆分后上传。")
        preview = assemble_preview(text_blocks(text, markdown=format == "md"), format)
        preview["body"] = text
        return preview

    try:
        with BytesIO(data) as source:
            if format == "pdf":
                return pdf_preview(source)
            return assemble_preview(docx_blocks(source), format)
    except DocumentImportError:
        raise
    except (BadZipFile, PackageNotFoundError, XMLSyntaxError, PyPdfError, ValueError, KeyError, OSError) as error:
        raise DocumentImportError("无法读取该文件，请确认格式正确且文件完整。") from error
