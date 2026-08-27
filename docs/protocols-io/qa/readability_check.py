#!/usr/bin/env python3
"""Deterministic readability checks for the Protocols.io guide."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SYLLABLE_OVERRIDES = {
    "ai": 2,
    "chatgpt": 2,
    "codex": 2,
    "csv": 3,
    "doi": 3,
    "github": 2,
    "mcp": 3,
    "openai": 3,
    "orcid": 2,
    "powershell": 3,
    "protocols": 3,
    "scientistone": 4,
    "url": 3,
    "windows": 2,
}


def clean_markdown(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = text.split("## Sources and current product guidance", 1)[0]
    text = re.sub(r"!\[([^]]*)\]\([^)]*\)", r"\1.", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*(?:[-*]|\d+[.)])\s+", "", text, flags=re.MULTILINE)
    text = text.replace("`", "")
    text = re.sub(r"\*+", "", text)
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line[-1:] not in ".!?":
            line += "."
        lines.append(line)
    return " ".join(lines)


def syllables(word: str) -> int:
    key = word.lower()
    if key in SYLLABLE_OVERRIDES:
        return SYLLABLE_OVERRIDES[key]
    key = re.sub(r"[^a-z]", "", key)
    if not key:
        return 1
    if len(key) <= 3:
        return 1
    groups = re.findall(r"[aeiouy]+", key)
    count = len(groups)
    if key.endswith("e") and not key.endswith(("le", "ye")) and count > 1:
        count -= 1
    if key.endswith("es") and len(key) > 4 and not key.endswith(("aes", "ees", "oes")) and count > 1:
        count -= 1
    if key.endswith("ed") and len(key) > 4 and not key.endswith(("ted", "ded")) and count > 1:
        count -= 1
    return max(1, count)


def measure(text: str) -> dict[str, float | int | bool]:
    clean = clean_markdown(text)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if s.strip()]
    words = re.findall(r"\b[A-Za-z]+(?:'[A-Za-z]+)?\b", clean)
    syllable_count = sum(syllables(word) for word in words)
    sentence_count = max(1, len(sentences))
    word_count = max(1, len(words))
    avg_sentence = word_count / sentence_count
    avg_syllables = syllable_count / word_count
    reading_ease = 206.835 - 1.015 * avg_sentence - 84.6 * avg_syllables
    grade = 0.39 * avg_sentence + 11.8 * avg_syllables - 15.59
    sentence_lengths = [len(re.findall(r"\b[A-Za-z]+(?:'[A-Za-z]+)?\b", s)) for s in sentences]
    long_sentences = sum(1 for length in sentence_lengths if length > 25)
    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "syllable_count": syllable_count,
        "average_sentence_words": round(avg_sentence, 2),
        "flesch_reading_ease": round(reading_ease, 2),
        "flesch_kincaid_grade": round(grade, 2),
        "sentences_over_25_words": long_sentences,
        "contains_em_dash": "—" in text,
        "grade_gate_pass": grade <= 6.9,
        "sentence_gate_pass": avg_sentence <= 15.0,
        "em_dash_gate_pass": "—" not in text,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    result = measure(args.source.read_text(encoding="utf-8"))
    payload = json.dumps(result, indent=2) + "\n"
    if args.json:
        args.json.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0 if all(result[key] for key in ("grade_gate_pass", "sentence_gate_pass", "em_dash_gate_pass")) else 1


if __name__ == "__main__":
    raise SystemExit(main())
