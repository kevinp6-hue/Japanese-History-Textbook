"""
convert_chapter.py
==================
Converts an Obsidian chapter note (.md) into a JSON block
ready to paste into chapters.json.

Usage:
    python convert_chapter.py <path_to_chapter.md>
    python convert_chapter.py <path_to_chapter.md> --out chapter.json

The script will print the JSON to the terminal by default.
Use --out to save it directly to a file instead.
"""

import re
import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# FRONTMATTER
# ---------------------------------------------------------------------------

def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML frontmatter and return (fields_dict, remaining_body)."""
    match = re.match(r'^---\n(.*?)\n---\n', content, re.DOTALL)
    if not match:
        raise ValueError(
            "No frontmatter found. Make sure your note starts with ---\n"
            "followed by fields like id:, num:, name:, etc."
        )
    fields = {}
    for line in match.group(1).splitlines():
        if ':' in line:
            key, _, value = line.partition(':')
            fields[key.strip()] = value.strip()
    return fields, content[match.end():]


# ---------------------------------------------------------------------------
# MARKDOWN → HTML
# ---------------------------------------------------------------------------

def md_to_html(text: str) -> str:
    """Convert inline Markdown to the allowed HTML subset."""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)  # bold
    text = re.sub(r'\*(.+?)\*',     r'<em>\1</em>',         text)  # italic *
    text = re.sub(r'_(.+?)_',       r'<em>\1</em>',         text)  # italic _
    return text


def lines_to_html(lines: list[str]) -> str:
    """
    Convert a block of Markdown lines into HTML using the allowed tags:
    <p> <h3> <strong> <em> <ul> <li> <div class='callout'>
    """
    html_parts = []
    paragraph_buf: list[str] = []
    list_buf:      list[str] = []

    def flush_paragraph():
        text = ' '.join(paragraph_buf).strip()
        paragraph_buf.clear()
        if text:
            html_parts.append(f'<p>{md_to_html(text)}</p>')

    def flush_list():
        if list_buf:
            items = ''.join(f'<li>{md_to_html(i)}</li>' for i in list_buf)
            html_parts.append(f'<ul>{items}</ul>')
            list_buf.clear()

    for raw in lines:
        line = raw.rstrip()

        # Blank line → close open blocks
        if not line:
            flush_paragraph()
            flush_list()
            continue

        # ### Sub-heading
        if line.lstrip().startswith('### '):
            flush_paragraph()
            flush_list()
            html_parts.append(f'<h3>{md_to_html(line.lstrip()[4:].strip())}</h3>')
            continue

        # Callout block  :::callout ... :::
        callout_open  = re.match(r'^:::\s*callout\s*$', line.strip())
        callout_close = re.match(r'^:::\s*$',           line.strip())
        if callout_open:
            flush_paragraph()
            flush_list()
            html_parts.append("<div class='callout'>")
            continue
        if callout_close:
            flush_paragraph()
            flush_list()
            html_parts.append("</div>")
            continue

        # Unordered list item
        if re.match(r'^\s*-\s+', line):
            flush_paragraph()
            list_buf.append(re.sub(r'^\s*-\s+', '', line))
            continue

        # Regular text — add to paragraph buffer
        flush_list()
        paragraph_buf.append(line.strip())

    flush_paragraph()
    flush_list()
    return ''.join(html_parts)


# ---------------------------------------------------------------------------
# TOP-LEVEL SECTION SPLITTER
# ---------------------------------------------------------------------------

def split_top_sections(body: str) -> dict[str, list[str]]:
    """
    Split the note body by ## headings.
    Returns an ordered dict: { heading_text: [lines_below] }
    Horizontal rules (---) between sections are ignored.
    """
    result: dict[str, list[str]] = {}
    current_key: str | None = None
    current_lines: list[str] = []

    for line in body.splitlines():
        if line.startswith('## '):
            if current_key is not None:
                result[current_key] = current_lines
            current_key = line[3:].strip()
            current_lines = []
        elif line.strip() == '---':
            continue          # skip dividers
        else:
            if current_key is not None:
                current_lines.append(line)

    if current_key:
        result[current_key] = current_lines

    return result


# ---------------------------------------------------------------------------
# SECTION PARSERS
# ---------------------------------------------------------------------------

RESERVED = {'Intro', 'Terms', 'Quiz', 'Sources'}


def parse_intro(lines: list[str]) -> str:
    return ' '.join(l.strip() for l in lines if l.strip())


def parse_content_sections(all_sections: dict[str, list[str]]) -> list[dict]:
    """
    Parse all non-reserved ## blocks as chapter sections.
    Each block may contain:
        ### Section Title
        **Dates:**
        - YYYY CE — event
        **Body:**
        paragraph text...
    """
    chapters_sections = []

    for heading, lines in all_sections.items():
        if heading in RESERVED:
            continue

        section: dict = {}
        dates: list  = []
        body_lines: list[str] = []
        mode = 'heading'   # heading | dates | body

        for line in lines:
            stripped = line.strip()

            if stripped.startswith('### '):
                section['h2'] = stripped[4:].strip()
                continue

            if stripped == '**Dates:**':
                mode = 'dates'
                continue

            if stripped == '**Body:**':
                mode = 'body'
                continue

            if mode == 'dates' and re.match(r'^\s*-\s+', line):
                text = re.sub(r'^\s*-\s+', '', line).strip()
                # Support em-dash, en-dash, or " - " as separator
                parts = re.split(r'\s*[—–]\s*|\s+-\s+', text, maxsplit=1)
                if len(parts) == 2:
                    dates.append([parts[0].strip(), parts[1].strip()])
                else:
                    dates.append([text, ''])
                continue

            if mode == 'body':
                body_lines.append(line)

        if not section.get('h2'):
            # Fallback: use the ## heading itself as the section title
            section['h2'] = heading

        section['body'] = lines_to_html(body_lines)

        if dates:
            section['dates'] = dates

        chapters_sections.append(section)

    return chapters_sections


def parse_terms(lines: list[str]) -> list[list[str]]:
    """Parse   - Term :: Definition   lines."""
    terms = []
    for line in lines:
        stripped = line.strip().lstrip('- ')
        if '::' in stripped:
            parts = stripped.split('::', 1)
            terms.append([parts[0].strip(), parts[1].strip()])
    return terms


def parse_quiz(lines: list[str]) -> list[dict]:
    """
    Parse quiz blocks of the form:
        1. Question text?
           - [ ] Option A ✓
           - [ ] Option B
           > Explanation
    The correct answer is marked with ✓ anywhere on the option line.
    """
    questions = []
    q_text     = None
    opts:  list[str] = []
    ans:   int       = 0
    exp:   str       = ''

    def save_question():
        if q_text:
            questions.append({'q': q_text, 'opts': opts[:], 'ans': ans, 'exp': exp})

    for line in lines:
        stripped = line.strip()

        # Numbered question
        q_match = re.match(r'^\d+\.\s+(.+)', stripped)
        if q_match:
            save_question()
            q_text = q_match.group(1).strip()
            opts, ans, exp = [], 0, ''
            continue

        # Checkbox option
        opt_match = re.match(r'^-\s*\[[ xX]?\]\s*(.+)', stripped)
        if opt_match and q_text:
            opt_text = opt_match.group(1)
            is_correct = '✓' in opt_text
            opt_text = opt_text.replace('✓', '').strip()
            if is_correct:
                ans = len(opts)
            opts.append(opt_text)
            continue

        # Blockquote explanation
        if stripped.startswith('> ') and q_text:
            exp = stripped[2:].strip()
            continue

    save_question()
    return questions


def parse_sources(lines: list[str]) -> list[dict]:
    """
    Parse source lines:
        - [Title](url)                   → { text, url }
        - Author, First. *Book*. Year.   → { text }
    """
    sources = []
    for line in lines:
        stripped = line.strip()
        if not stripped or not stripped.startswith('- '):
            continue
        text = stripped[2:].strip()

        link_match = re.match(r'^\[(.+?)\]\((.+?)\)$', text)
        if link_match:
            sources.append({'text': link_match.group(1), 'url': link_match.group(2)})
        else:
            # Strip italic markers from book titles
            clean = re.sub(r'\*(.+?)\*', r'\1', text)
            sources.append({'text': clean})
    return sources


# ---------------------------------------------------------------------------
# MAIN CONVERTER
# ---------------------------------------------------------------------------

def convert(filepath: str) -> dict:
    path    = Path(filepath)
    content = path.read_text(encoding='utf-8')

    frontmatter, body = parse_frontmatter(content)

    chapter = {
        'id':    frontmatter.get('id',    ''),
        'num':   frontmatter.get('num',   ''),
        'jp':    frontmatter.get('jp',    ''),
        'name':  frontmatter.get('name',  ''),
        'years': frontmatter.get('years', ''),
    }

    top = split_top_sections(body)

    chapter['intro']    = parse_intro(top.get('Intro', []))
    chapter['sections'] = parse_content_sections(top)
    chapter['terms']    = parse_terms(top.get('Terms', []))
    chapter['quiz']     = parse_quiz(top.get('Quiz',   []))

    sources = parse_sources(top.get('Sources', []))
    if sources:
        chapter['sources'] = sources

    return chapter


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]

    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    filepath = args[0]
    out_path = None

    if '--out' in args:
        idx = args.index('--out')
        if idx + 1 < len(args):
            out_path = args[idx + 1]
        else:
            print("Error: --out requires a filename.")
            sys.exit(1)

    try:
        chapter = convert(filepath)
    except FileNotFoundError:
        print(f"Error: File not found — {filepath}")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    output = json.dumps(chapter, indent=2, ensure_ascii=False)

    if out_path:
        Path(out_path).write_text(output, encoding='utf-8')
        print(f"✓ Saved to {out_path}")
    else:
        print(output)
        print("\n# ── Paste the block above into your chapters.json array ──")


if __name__ == '__main__':
    main()
