"""
json_to_chapter.py
==================
Converts a chapter JSON block back into an Obsidian markdown note
that matches the Chapter Template format.

The input can be:
  - A standalone JSON file containing one chapter object
  - A full chapters.json array — you'll be prompted to pick which chapter to convert

Usage:
    python json_to_chapter.py <path_to_file.json>
    python json_to_chapter.py <path_to_file.json> --id meijiEra
    python json_to_chapter.py <path_to_file.json> --out "Meiji Restoration.md"
    python json_to_chapter.py <path_to_file.json> --id meijiEra --out "Meiji Restoration.md"
"""

import re
import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# HTML → MARKDOWN
# ---------------------------------------------------------------------------

def html_to_md(html: str) -> str:
    """Convert the allowed HTML subset back to Markdown."""
    # Unwrap block tags, preserving inner content
    html = re.sub(r'<h3>(.*?)</h3>',          r'### \1\n',  html)
    html = re.sub(r'<p>(.*?)</p>',             r'\1\n\n',   html)
    html = re.sub(r"<div class=['\"]callout['\"]>(.*?)</div>",
                  r':::callout\n\1\n:::\n', html, flags=re.DOTALL)
    html = re.sub(r'<ul>(.*?)</ul>',           r'\1',        html, flags=re.DOTALL)
    html = re.sub(r'<li>(.*?)</li>',           r'- \1\n',   html)
    # Inline tags
    html = re.sub(r'<strong>(.*?)</strong>',   r'**\1**',   html)
    html = re.sub(r'<em>(.*?)</em>',           r'*\1*',     html)
    # Strip any remaining tags
    html = re.sub(r'<[^>]+>',                  '',          html)
    # Normalise whitespace — collapse 3+ newlines to 2
    html = re.sub(r'\n{3,}', '\n\n', html)
    return html.strip()


# ---------------------------------------------------------------------------
# SECTION BUILDERS
# ---------------------------------------------------------------------------

def build_frontmatter(ch: dict) -> str:
    return (
        f"---\n"
        f"id: {ch.get('id', '')}\n"
        f"num: \"{ch.get('num', '')}\"\n"
        f"jp: {ch.get('jp', '')}\n"
        f"name: {ch.get('name', '')}\n"
        f"years: {ch.get('years', '')}\n"
        f"status: draft\n"
        f"---\n"
    )


def build_intro(ch: dict) -> str:
    intro = ch.get('intro', '').strip()
    return f"## Intro\n{intro}\n"


def build_sections(ch: dict) -> str:
    parts = []
    for i, section in enumerate(ch.get('sections', []), start=1):
        heading = section.get('h2', f'Section {i}')
        lines   = [f"## {heading}", ""]

        # ### sub-heading
        lines.append(f"### {heading}")

        # Dates block (optional)
        dates = section.get('dates', [])
        if dates:
            lines.append("**Dates:**")
            for label, event in dates:
                lines.append(f"- {label} — {event}")
            lines.append("")

        # Body block
        body_md = html_to_md(section.get('body', ''))
        lines.append("**Body:**")
        lines.append(body_md)
        lines.append("")

        parts.append('\n'.join(lines))

    return '\n---\n\n'.join(parts)


def build_terms(ch: dict) -> str:
    terms = ch.get('terms', [])
    if not terms:
        return "## Terms\n- Term :: Definition\n"
    lines = ["## Terms"]
    for pair in terms:
        if len(pair) == 2:
            lines.append(f"- {pair[0]} :: {pair[1]}")
    return '\n'.join(lines) + '\n'


def build_quiz(ch: dict) -> str:
    quiz = ch.get('quiz', [])
    if not quiz:
        return "## Quiz\n"
    lines = ["## Quiz", ""]
    for i, q in enumerate(quiz, start=1):
        lines.append(f"{i}. {q.get('q', '')}")
        correct = q.get('ans', 0)
        for j, opt in enumerate(q.get('opts', [])):
            marker = ' ✓' if j == correct else ''
            lines.append(f"   - [ ] {opt}{marker}")
        exp = q.get('exp', '')
        if exp:
            lines.append(f"   > {exp}")
        lines.append("")
    return '\n'.join(lines)


def build_sources(ch: dict) -> str | None:
    sources = ch.get('sources')
    if not sources:
        return None
    lines = ["## Sources"]
    for src in sources:
        url  = src.get('url')
        text = src.get('text', '')
        if url:
            lines.append(f"- [{text}]({url})")
        else:
            lines.append(f"- {text}")
    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------------------
# MAIN CONVERTER
# ---------------------------------------------------------------------------

def convert(chapter: dict) -> str:
    parts = [
        build_frontmatter(chapter),
        "\n## Intro\n" + chapter.get('intro', '').strip() + "\n",
        "\n---\n\n" + build_sections(chapter),
        "\n---\n\n" + build_terms(chapter),
        "\n---\n\n" + build_quiz(chapter),
    ]

    sources = build_sources(chapter)
    if sources:
        parts.append("\n---\n\n" + sources)

    return '\n'.join(parts)


# ---------------------------------------------------------------------------
# JSON LOADING & CHAPTER SELECTION
# ---------------------------------------------------------------------------

def load_chapters(filepath: str) -> list[dict]:
    """Load a JSON file and always return a list of chapter dicts."""
    data = json.loads(Path(filepath).read_text(encoding='utf-8-sig'))
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise ValueError("JSON must be a chapter object or an array of chapter objects.")


def pick_chapter(chapters: list[dict], chapter_id: str | None) -> dict:
    """Select one chapter from the list, prompting the user if needed."""
    if chapter_id:
        for ch in chapters:
            if ch.get('id') == chapter_id:
                return ch
        raise ValueError(f"No chapter found with id '{chapter_id}'.")

    if len(chapters) == 1:
        return chapters[0]

    # Multiple chapters — show a menu
    print("\nMultiple chapters found. Which one would you like to convert?\n")
    for i, ch in enumerate(chapters):
        print(f"  [{i}]  {ch.get('num', '?').rjust(3)}  {ch.get('name', ch.get('id', ''))}")
    print()

    while True:
        raw = input("Enter number: ").strip()
        if raw.isdigit() and 0 <= int(raw) < len(chapters):
            return chapters[int(raw)]
        print(f"Please enter a number between 0 and {len(chapters) - 1}.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]

    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    filepath   = args[0]
    chapter_id = None
    out_path   = None

    if '--id' in args:
        idx = args.index('--id')
        if idx + 1 < len(args):
            chapter_id = args[idx + 1]
        else:
            print("Error: --id requires a value.")
            sys.exit(1)

    if '--out' in args:
        idx = args.index('--out')
        if idx + 1 < len(args):
            out_path = args[idx + 1]
        else:
            print("Error: --out requires a filename.")
            sys.exit(1)

    try:
        chapters = load_chapters(filepath)
    except FileNotFoundError:
        print(f"Error: File not found — {filepath}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON — {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    try:
        chapter = pick_chapter(chapters, chapter_id)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    md = convert(chapter)

    if out_path:
        Path(out_path).write_text(md, encoding='utf-8')
        print(f"✓ Saved to {out_path}")
    else:
        # Auto-name from chapter name if no --out given
        safe_name = re.sub(r'[^\w\s-]', '', chapter.get('name', 'chapter')).strip()
        safe_name = re.sub(r'\s+', ' ', safe_name)
        auto_path = f"{safe_name}.md"
        Path(auto_path).write_text(md, encoding='utf-8')
        print(f"✓ Saved to {auto_path}")


if __name__ == '__main__':
    main()
