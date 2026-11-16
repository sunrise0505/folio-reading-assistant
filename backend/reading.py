import csv
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).with_name("data")
WORD = re.compile(r"[a-z]+(?:['’-][a-z]+)*", re.IGNORECASE)
EXPRESSION = re.compile(rf"{WORD.pattern}(?:[^\S\r\n]+{WORD.pattern})*", WORD.flags)
TOPIC_TERMS = {
    "政治与国际": r"democrats?|republicans?|elections?|voters?|senate|parliament|diplomacy|geopolitics",
    "健康与医疗": r"patients?|healthcare|health care|doctors?|hospitals?|medicine|vaccines?|therapy|clinical",
    "科学与技术": r"genes?|genetics|evolution|physics|scientists?|astronomy|algorithms?|robots?|artificial intelligence",
    "自然与环境": r"ecosystems?|biodiversity|habitats?|conservation|wildlife|forests?|climate|pollution|indigenous",
    "法律与社会": r"bans?|banned|rights|courts?|laws?|legal|prohibitions?|freedom of speech|regulation",
    "经济观察": r"central banks?|interest rates?|inflation|economy|economic|gdp|markets?|trade|financ(?:e|ial)|recession",
    "城市与环境": r"urban|cities|city|housing|sidewalks?|neighbou?rhoods?|parks?|public transport|pedestrians?",
    "文化与生活": r"librar(?:y|ies)|novels?|books?|reading habits|literature|paintings?|artists?|cinema|museums?",
}
TOPIC_PATTERNS = {topic: re.compile(rf"\b(?:{terms})\b", re.IGNORECASE) for topic, terms in TOPIC_TERMS.items()}
IRREGULAR = {
    "held": "hold", "drew": "draw", "went": "go", "was": "be", "were": "be",
    "had": "have", "did": "do", "does": "do", "took": "take", "made": "make", "kept": "keep",
    "said": "say", "left": "leave", "read": "read", "led": "lead", "built": "build",
}


@lru_cache(maxsize=256)
def suggest_cover_section(title: str, opening: str) -> str | None:
    scores = []
    for topic, pattern in TOPIC_PATTERNS.items():
        title_hits = set(pattern.findall(title.casefold()))
        body_hits = set(pattern.findall(opening.casefold()))
        score = 5 * len(title_hits) + min(4, len(body_hits - title_hits))
        scores.append((score, topic))
    matches = sorted(scores, reverse=True)
    best, topic = matches[0]
    return topic if best >= 2 and best > matches[1][0] else None


@dataclass(frozen=True)
class Entry:
    word: str
    phonetic: str
    pos: str
    definition: str
    frequency: int | None


def frequency(value: str) -> int | None:
    return int(value) if value.isdigit() and int(value) > 0 else None


@lru_cache(maxsize=1)
def dictionary() -> dict[str, Entry]:
    entries = {}
    for name in ("dictionary.tsv", "demo_dictionary.tsv"):
        with (DATA_DIR / name).open(encoding="utf-8", newline="") as file:
            for row in csv.DictReader(file, delimiter="\t"):
                word = row["word"]
                existing = entries.get(word)
                rank = existing.frequency if existing else frequency(row["frequency"])
                entries[word] = Entry(word, row["phonetic"], row["pos"], row["definition"], rank)
    return entries


def normalize(word: str) -> str:
    return " ".join(word.lower().replace("’", "'").split())


@lru_cache(maxsize=1)
def inflections() -> dict[str, str]:
    with (DATA_DIR / "inflections.tsv").open(encoding="utf-8", newline="") as file:
        return dict(csv.reader(file, delimiter="\t"))


def variants(word: str):
    yield word
    lemma = IRREGULAR.get(word) or inflections().get(word)
    if lemma:
        yield lemma
    if word.endswith(("ies", "ied")):
        yield word[:-3] + "y"
    for suffix in ("ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) > len(suffix) + 2:
            stem = word[:-len(suffix)]
            yield stem
            if suffix in ("ing", "ed"):
                yield stem + "e"
                if len(stem) > 2 and stem[-1] == stem[-2]:
                    yield stem[:-1]


@lru_cache(maxsize=8192)
def lookup(word: str) -> Entry | None:
    word = normalize(word)
    if " " in word:
        return lookup_phrase(word)
    entries = dictionary()
    return next((entries[form] for form in variants(word) if form in entries), None)


@lru_cache(maxsize=1)
def phrase_dictionary() -> dict[str, Entry]:
    with (DATA_DIR / "phrases.tsv").open(encoding="utf-8", newline="") as file:
        return {
            row["phrase"]: Entry(row["phrase"], "", row["pos"], row["definition"], None)
            for row in csv.DictReader(file, delimiter="\t")
        }


def lookup_phrase(phrase: str) -> Entry | None:
    entries = phrase_dictionary()
    if phrase in entries:
        return entries[phrase]
    first, _, tail = phrase.partition(" ")
    for form in variants(first):
        entry = entries.get(f"{form} {tail}")
        if entry and entry.pos == "v.":
            return entry
    head, _, last = phrase.rpartition(" ")
    for form in variants(last):
        entry = entries.get(f"{head} {form}")
        if entry and entry.pos == "n.":
            return entry
    return None


@lru_cache(maxsize=1)
def phrase_bounds() -> tuple[set[str], int]:
    phrases = [phrase.split() for phrase in phrase_dictionary()]
    return {parts[0] for parts in phrases}, max(map(len, phrases))


def recognize_phrases(text: str, seen: set[str]) -> list[dict]:
    tokens = list(WORD.finditer(text))
    starts, max_words = phrase_bounds()
    matches = []
    index = 0
    while index < len(tokens) - 1:
        if not any(form in starts for form in variants(normalize(tokens[index][0]))):
            index += 1
            continue
        start = tokens[index].start()
        stop = min(index + max_words, len(tokens))
        for end in range(stop, index + 1, -1):
            surface = text[start:tokens[end - 1].end()]
            if len(surface) > 80 or not EXPRESSION.fullmatch(surface):
                continue
            entry = lookup_phrase(normalize(surface))
            if entry:
                matches.append({"start": start, "surface": surface, "first_occurrence": entry.word not in seen})
                seen.add(entry.word)
                index = end
                break
        else:
            index += 1
    return matches


EXAM_TAGS = {"cet4": "四级", "cet6": "六级", "ielts": "雅思", "gre": "GRE"}
POS_PATTERN = r"(?:adj|adv|prep|conj|pron|num|det|art|aux|int|vt|vi|n|v|a|ad|s|r|interj)\."
POS_LABELS = {
    "n.": "名词", "v.": "动词", "vt.": "及物动词", "vi.": "不及物动词", "aux.": "助动词",
    "a.": "形容词", "adj.": "形容词", "s.": "形容词",
    "adv.": "副词", "ad.": "副词", "r.": "副词", "prep.": "介词", "conj.": "连词",
    "pron.": "代词", "num.": "数词", "det.": "限定词", "art.": "冠词", "int.": "感叹词", "interj.": "感叹词",
}


@lru_cache(maxsize=1)
def dictionary_details() -> dict:
    with (DATA_DIR / "dictionary_details.tsv").open(encoding="utf-8", newline="") as file:
        return {row["word"]: row for row in csv.DictReader(file, delimiter="\t")}


def chinese_senses(entry: Entry) -> list[dict[str, str]]:
    parts = re.split(rf"；(?=\s*(?:{POS_PATTERN}|\[))", entry.definition)
    senses = []
    for index, part in enumerate(parts):
        prefix = re.match(rf"^\s*({POS_PATTERN}|\[[^\]]+\])\s*", part)
        label = prefix[1] if prefix else entry.pos if index == 0 else ""
        value = part[prefix.end():] if prefix else part
        senses.extend({"pos": label, "meaning": item.strip()} for item in re.split(r"[；;]", value) if item.strip())
    return senses


def exam_memberships(lemma: str) -> list[str]:
    tags = dictionary_details().get(lemma, {}).get("tags", "")
    return [EXAM_TAGS[tag] for tag in tags.split()]


def entry_details(entry: Entry) -> dict:
    details = dictionary_details().get(entry.word, {})
    return {
        "senses": chinese_senses(entry),
        "english": details.get("english", "").splitlines(),
        "exams": exam_memberships(entry.word),
    }


@lru_cache(maxsize=8192)
def parts_of_speech(lemma: str, meaning: str) -> tuple[str, ...]:
    entry = lookup(lemma)
    if entry is None:
        return ()
    senses = chinese_senses(entry)
    matches = [sense for sense in senses if meaning == sense["meaning"]]
    if not matches:
        matches = [sense for sense in senses if meaning in re.split(r"\s*[,，、]\s*", sense["meaning"])]
    return tuple(dict.fromkeys(POS_LABELS[sense["pos"]] for sense in matches if sense["pos"] in POS_LABELS))


def split_paragraphs(body: str) -> list[str]:
    return [re.sub(r"\s+", " ", part).strip() for part in re.split(r"\n\s*\n", body) if part.strip()]


def plain_markdown(body: str) -> str:
    body = re.sub(r"(?m)^[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]*|[-*+][ \t]+|\d+\.[ \t]+)", "", body)
    body = re.sub(r"!?\[([^\]]*)\]\([^)]+\)", r"\1", body)
    return re.sub(r"(?<!\w)(\*{1,2}|_{1,2}|`)(.+?)\1(?!\w)", r"\2", body)


def difficulty(body: str, mastered: set[str]) -> dict:
    words = WORD.findall(body.lower())
    sentences = [len(WORD.findall(sentence)) for sentence in re.split(r"[.!?]+", body)]
    lengths = [length for length in sentences if length]
    average = round(sum(lengths) / max(1, len(lengths)), 1)
    long_ratio = round(100 * sum(length >= 23 for length in lengths) / max(1, len(lengths)), 1)
    rare = []
    ranked_words = 0
    for word in words:
        entry = lookup(word)
        if entry and entry.frequency is not None:
            ranked_words += 1
            if entry.frequency >= 3500:
                rare.append(entry.word)
    ratio = round(100 * len(rare) / max(1, len(words)), 1)
    personal = round(100 * sum(word not in mastered for word in rare) / max(1, len(words)), 1)

    def score(rare_ratio: float) -> float:
        return rare_ratio + max(0, average - 12) * 0.8 + long_ratio * 0.1

    def exam_level(value: float) -> str:
        if value >= 24:
            return "GRE"
        if value >= 13:
            return "雅思"
        if value >= 6:
            return "六级"
        return "四级"

    def level(value: float) -> str:
        return "进阶" if value >= 16 else "适中" if value >= 6 else "入门"

    overall_score, personal_score = score(ratio), score(personal)
    exam = exam_level(overall_score)
    stars = {"四级": 1 if overall_score < 3 else 2, "六级": 3, "雅思": 4, "GRE": 5}[exam]

    return {
        "word_count": len(words), "average_sentence": average, "long_ratio": long_ratio,
        "rare_ratio": ratio, "personal_ratio": personal, "level": level(overall_score),
        "personal_level": level(personal_score), "exam": exam, "stars": stars,
        "personal_exam": exam_level(personal_score), "rare_words": list(dict.fromkeys(rare))[:6],
        "coverage": round(100 * ranked_words / max(1, len(words))),
    }
