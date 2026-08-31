#!/usr/bin/env python3
"""Deterministic content and file checks for the beginner protocol package."""

from __future__ import annotations

import csv
import json
import re
import statistics
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scientist1-beginner-protocol.md"
DATA = ROOT / "example-data" / "bean-seedling-growth.csv"

REQUIRED_TEXT = [
    "What Codex is",
    "Choose a plan",
    "Download the desktop app",
    "Open Codex",
    "Try one simple Codex task",
    "Approve for me",
    "Check your data controls",
    "Add the Scientist1 marketplace",
    "Install and open Scientist1",
    "Add from Marketplace",
    "AdamHAwad/scientistone-codex-plugin",
    "Try now",
    "Start a new chat",
    "What should S1 investigate?",
    "What should the answer help you decide or understand?",
    "What files should S1 use?",
    "Are there papers S1 should read?",
    "What evidence would answer the question?",
    "What limits should S1 follow?",
    "Review your study request",
    "Review the study before it begins",
    "Approve and start study",
    "Watch the live study map",
    "Not started",
    "Working now",
    "Needs your input",
    "Checked",
    "Study record verified",
    "Keep Codex and Scientist1 up to date",
    "select **Refresh**",
    "Open the completed results",
    "Safety and privacy warning",
    "Troubleshooting",
]

REQUIRED_ASSETS = [
    "01-research-question.png",
    "02-purpose.png",
    "03-files.png",
    "04-prior-work.png",
    "05-evaluation.png",
    "06-limits.png",
    "07-review-request.png",
    "08-waiting.png",
    "09-plan-review.png",
    "10-study-flow.png",
    "11-chain-of-evidence.png",
]


def main() -> int:
    text = SOURCE.read_text(encoding="utf-8")
    missing_text = [item for item in REQUIRED_TEXT if item not in text]
    image_links = re.findall(r"!\[[^]]+\]\(([^)]+)\)", text)
    missing_linked_images = [link for link in image_links if not (ROOT / link).is_file()]
    missing_assets = [name for name in REQUIRED_ASSETS if not (ROOT / "assets" / name).is_file()]

    with DATA.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    groups: dict[int, list[float]] = {8: [], 12: []}
    for row in rows:
        group = int(row["light_hours_per_day"])
        groups[group].append(float(row["day7_height_cm"]) - float(row["start_height_cm"]))
    means = {str(group): round(statistics.mean(values), 3) for group, values in groups.items()}
    difference = round(means["12"] - means["8"], 3)

    personal_path_hits = re.findall(r"/(?:Users|home)/[^\s)`]+", text)
    secret_terms = re.findall(r"(?i)(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+", text)
    alt_texts = re.findall(r"!\[([^]]*)\]\([^)]+\)", text)
    weak_alt_texts = [alt for alt in alt_texts if len(alt.split()) < 5 or re.fullmatch(r"(?i)(?:image|screenshot|figure)\s*\d*", alt)]
    screenshot_sizes = {}
    for name in REQUIRED_ASSETS[:9]:
        with Image.open(ROOT / "assets" / name) as image:
            screenshot_sizes[name] = image.size
    desktop_screenshots = all(
        width / height >= 1.2
        for name, (width, height) in screenshot_sizes.items()
        if name != "07-review-request.png"
    )

    checks = {
        "required_text_present": not missing_text,
        "all_linked_images_exist": not missing_linked_images,
        "all_required_assets_exist": not missing_assets,
        "practice_csv_has_24_rows": len(rows) == 24,
        "practice_groups_have_12_rows_each": all(len(values) == 12 for values in groups.values()),
        "practice_expected_means_match": means == {"8": 3.133, "12": 4.425} and difference == 1.292,
        "no_personal_absolute_paths": not personal_path_hits,
        "no_secret_assignments": not secret_terms,
        "all_images_have_descriptive_alt_text": not weak_alt_texts,
        "setup_screenshots_keep_desktop_proportions": desktop_screenshots,
        "no_em_dash": "—" not in text,
        "uses_approve_for_me": "Approve for me" in text,
        "does_not_teach_ask_for_approval": "Ask for approval" not in text,
        "research_teams_are_named_ai_teams": not re.search(r"(?<!AI )\bteams?\b", text),
        "no_terminal_install_path": not re.search(r"(?i)(terminal|powershell|codex plugin marketplace add|codex plugin add)", text),
        "no_public_directory_assumption": "Plugin Directory" not in text,
    }
    report = {
        "checks": checks,
        "details": {
            "missing_text": missing_text,
            "missing_linked_images": missing_linked_images,
            "missing_assets": missing_assets,
            "data_rows": len(rows),
            "group_means_cm": means,
            "mean_difference_cm": difference,
            "personal_path_hits": personal_path_hits,
            "secret_assignment_count": len(secret_terms),
            "weak_alt_texts": weak_alt_texts,
            "screenshot_sizes": screenshot_sizes,
        },
    }
    output = ROOT / "qa" / "content-report.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
