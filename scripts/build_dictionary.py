"""Build the bundled, ranked ECDICT subset and its inflection index."""

import argparse
import csv
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "backend" / "data"
ENGLISH = re.compile(r"[a-z]+(?:['-][a-z]+)*")
PART_OF_SPEECH = re.compile(r"^(?:adj|adv|prep|conj|pron|num|det|int|vt|vi|n|v|a|ad|interj)\.")


def rank(row):
    return next((int(value) for value in (row["frq"], row["bnc"]) if value.isdigit() and int(value) > 0), 0)


def build(source):
    entries = {}
    aliases = {}
    details = {}
    with source.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            word = row["word"].lower()
            if not ENGLISH.fullmatch(word):
                continue
            lemma = next((item[2:] for item in row["exchange"].split("/") if item.startswith("0:")), "")
            if lemma and lemma != word and ENGLISH.fullmatch(lemma):
                aliases[word] = lemma
                continue
            frequency = rank(row)
            meaning = row["translation"].replace(r"\n", "；").replace("\n", "；").strip()
            if not 0 < frequency <= 25000 or not meaning:
                continue
            pos = PART_OF_SPEECH.match(meaning)
            if pos:
                meaning = meaning[pos.end():].lstrip()
            entries[word] = (word, row["phonetic"], pos[0] if pos else "", meaning, frequency)
            definitions = row["definition"].replace(r"\r", "").replace(r"\n", "\n").splitlines()
            tags = " ".join(tag for tag in row["tag"].split() if tag in {"cet4", "cet6", "ielts", "gre"})
            details[word] = (word, tags, "\n".join(line.strip() for line in definitions[:5] if line.strip()))

    with (DATA / "dictionary.tsv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerow(["word", "phonetic", "pos", "definition", "frequency"])
        writer.writerows(entries[word] for word in sorted(entries))

    with (DATA / "dictionary_details.tsv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerow(["word", "tags", "english"])
        writer.writerows(details[word] for word in sorted(details) if any(details[word][1:]))

    with (DATA / "inflections.tsv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter="\t", lineterminator="\n")
        writer.writerows((word, lemma) for word, lemma in sorted(aliases.items()) if lemma in entries)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="ECDICT ecdict.csv")
    build(parser.parse_args().source)
