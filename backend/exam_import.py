"""Find reading passages in extracted exam text before the user confirms import."""

import re
from collections import Counter

from .reading import WORD

PASSAGE = re.compile(
    r"^(?:reading\s+passage|passage|text)\s*"
    r"(?:one|two|three|four|five|six|[1-9]\d?|[a-f]|[ivx]{1,4})"
    r"(?:\s*[:：.\-–—]\s*(.*))?\s*$", re.IGNORECASE,
)
BASED_ON = re.compile(
    r"^questions?\s+\d+\s*(?:to|through|[-–—~])\s*\d+\s+"
    r"(?:are\s+)?based\s+on\s+(?:the\s+)?following\s+passage.*$", re.IGNORECASE,
)
READING = re.compile(r"reading\s+(?:comprehension|passages?)|阅读理解|阅读下[列面]|IELTS", re.IGNORECASE)
QUESTION = re.compile(
    r"^\d{1,3}(?:\s*[.．)）]\s*\S|\s+(?:what|which|why|how|when|where|who|according)\b)",
    re.IGNORECASE,
)
OPTION = re.compile(r"^(?:[（(][A-Da-d][)）]|[A-Da-d][).．])\s*\S")
STOP = re.compile(
    r"^(?:questions?\s+\d|directions?\s*[:：]|instructions?\s*[:：]|"
    r"part\s+[ivx\d]+\b|section\s+[a-z]\b|"
    r"第[一二三四五六七八九十\d]+[节部分]|根据(?:短文|文章)|下列|以上).*", re.IGNORECASE,
)
PAGE_NUMBER = re.compile(r"^(?:[-–—]\s*)?(?:page\s*)?\d{1,3}(?:\s*(?:/|of)\s*\d{1,3})?(?:\s*[-–—])?$", re.IGNORECASE)
ANSWER_SECTION = re.compile(
    r"^(?:参考答案(?:与解析)?|答案(?:解析)?|试题解析|"
    r"(?:reference\s+)?answers?(?:\s+(?:key|and\s+explanations?))?)(?:\s*[:：].*)?$",
    re.IGNORECASE,
)


def exam_lines(pages: list[str]) -> list[str]:
    """Remove repeated short page headers/footers, retaining sentence text."""
    split = [page.replace('\u00ad\n', '').splitlines() for page in pages]
    edges = Counter()
    for page in split:
        nonempty = [line.strip() for line in page if line.strip()]
        edges.update(set(nonempty[:2] + nonempty[-2:]))
    repeated = {
        line for line, count in edges.items()
        if count >= 2 and len(line) < 160 and len(WORD.findall(line)) < 15
        and not line.endswith(('.', '!', '?', '。'))
        and not PASSAGE.fullmatch(line) and not re.fullmatch(r'[A-F]', line)
    }
    lines = []
    for page in split:
        positions = [i for i, line in enumerate(page) if line.strip()]
        edge_positions = set(positions[:2] + positions[-2:])
        for i, line in enumerate(page):
            text = line.strip()
            if i in edge_positions and (text in repeated or PAGE_NUMBER.fullmatch(text)):
                continue
            lines.append(text)
    return lines


def extract_exam_articles(pages: list[str], *, required: bool = False) -> dict | None:
    lines = exam_lines(pages)
    has_heading = any(PASSAGE.fullmatch(line) for line in lines)
    has_reading = any(READING.search(line) for line in lines)
    detected = required or any(BASED_ON.fullmatch(line) for line in lines) or (
        has_heading and (has_reading or any(QUESTION.match(line) for line in lines))
    ) or (has_reading and any(re.fullmatch(r'[A-F]', line) for line in lines))
    if not detected:
        return None

    articles = []
    parts: list[str] | None = None
    title = ''
    skipped = 0

    def finish():
        nonlocal parts, title, skipped
        if parts is None:
            return
        paragraphs = []
        wrapped = []
        for line in parts + ['']:
            if line:
                # Repair a word hyphenated at a line break without changing in-line hyphens.
                if wrapped and re.search(r'[a-z]-$', wrapped[-1]) and re.match(r'^[a-z]', line):
                    wrapped[-1] = wrapped[-1][:-1] + line
                else:
                    wrapped.append(line)
            elif wrapped:
                paragraphs.append(' '.join(wrapped))
                wrapped = []
        body = '\n\n'.join(paragraphs).strip()
        if len(WORD.findall(body)) >= 45:
            articles.append({'title': title or f'阅读文章 {len(articles) + 1}', 'body': body})
        elif body:
            skipped += 1
        parts, title = None, ''

    for index, line in enumerate(lines):
        if ANSWER_SECTION.fullmatch(line):
            break
        marker = PASSAGE.fullmatch(line)
        letter = re.fullmatch(r'[A-F]', line) if not has_heading and (required or has_reading) else None
        if marker or letter or BASED_ON.fullmatch(line):
            # CET often places a question-range introduction directly after Passage One.
            if BASED_ON.fullmatch(line) and parts is not None and not any(parts):
                continue
            finish()
            parts = []
            title = (marker[1] or '').strip()[:180] if marker else ''
            continue
        if parts is None:
            continue
        if not any(parts) and re.match(r"^(?:you should spend|read the following passage|read the passage below)\b", line, re.IGNORECASE):
            continue
        if STOP.match(line) or QUESTION.match(line) or OPTION.match(line):
            finish()
            continue
        if not line and not parts:
            continue
        if (
            not any(parts) and not title and line and len(line) <= 180
            and len(WORD.findall(line)) in range(1, 19)
            and not re.fullmatch(r'[A-Z]', line)
            and not line.endswith(('.', '!', '?', ':', ';', '。'))
            and index + 1 < len(lines) and not lines[index + 1]
        ):
            title = line
            continue
        parts.append(line)
    finish()

    warnings = ['已按试卷结构提取阅读文章，请核对分篇、正文和原卷，尤其是跨页、分栏及填空位置。']
    if skipped:
        warnings.append(f'有 {skipped} 段内容较短，未自动列为文章，可查看整份文本补充。')
    if not articles:
        warnings = ['暂未可靠识别出阅读文章，已保留整份文本。请手动整理正文后导入，或上传仅包含阅读部分的清晰文件。']
    return {'articles': articles, 'warnings': warnings, 'extraction_kind': 'exam'}
