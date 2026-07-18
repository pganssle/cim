# /// script
# dependencies = [
#   "pyyaml",
# ]
# ///
"""Compile changelog.d/*.md entries into _data/changelog.yml and NEWS.md."""

import sys
from datetime import date
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).parent.parent
CHANGELOG_DIR = REPO_ROOT / "changelog.d"
DATA_FILE = REPO_ROOT / "_data" / "changelog.yml"
NEWS_FILE = REPO_ROOT / "NEWS.md"


def load_changelog() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    data = yaml.safe_load(DATA_FILE.read_text())
    return data if data else []


def write_changelog(changelog: list[dict]) -> None:
    DATA_FILE.write_text(
        yaml.dump(changelog, allow_unicode=True, sort_keys=False, default_flow_style=False)
    )


def write_news(changelog: list[dict]) -> None:
    lines = ["# News\n"]
    for release in changelog:
        lines.append(f"\n## {release['date']}\n")
        for entry in release["entries"]:
            lines.append(f"- {entry}\n")
    NEWS_FILE.write_text("".join(lines))


def main() -> int:
    entry_files = sorted(
        f for f in CHANGELOG_DIR.glob("*.md") if f.name.upper() != "README.MD"
    )
    if not entry_files:
        print("No changelog entries found in changelog.d/")
        return 0

    entries = [f.read_text().strip() for f in entry_files if f.read_text().strip()]
    if not entries:
        print("All changelog.d/ files were empty.")
        return 0

    today = date.today().isoformat()
    changelog = load_changelog()

    if changelog and changelog[0]["date"] == today:
        changelog[0]["entries"].extend(entries)
    else:
        changelog.insert(0, {"date": today, "entries": entries})

    write_changelog(changelog)
    write_news(changelog)

    for f in entry_files:
        f.unlink()

    print(f"Compiled {len(entries)} entr{'y' if len(entries) == 1 else 'ies'} for {today}.")
    print(f"Updated {DATA_FILE.relative_to(REPO_ROOT)} and {NEWS_FILE.relative_to(REPO_ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
