# 日本の歴史 — Japanese History Textbook

An interactive online textbook covering ten major eras of Japanese history, with textbook-depth content, key terms, chronological sidebars, and a quiz at the end of each chapter.

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Page skeleton and HTML structure |
| `styles.css` | All visual styles — edit CSS variables here to change colours |
| `chapters.json` | **Edit this file** to add, remove, or update chapters |
| `engine.js` | Rendering logic — no need to touch |
| `README.md` | This file |

## Running the Site

The site fetches `chapters.json` at runtime, so it must be served from a web server — it will **not** work when opened directly as a `file://` URL.

```bash
# Any of these will work:
npx serve .
python -m http.server 8000
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

---

## Editing Content

### To Add a New Chapter

1. Open `chapters.json`
2. Copy the template below and paste it inside the JSON array (before the last `]`)
3. Add a comma after the previous chapter's closing `}`
4. Fill in all fields
5. Save. The chapter will appear in the sidebar, home grid, and prev/next navigation automatically.

### Chapter Template

```json
{
  "id": "uniqueId",
  "num": "11",
  "jp": "Japanese characters here",
  "name": "Chapter Title in English",
  "years": "YYYY - YYYY",
  "intro": "One to two sentence overview.",
  "sections": [
    {
      "h2": "Section Heading",
      "dates": [
        ["YYYY CE", "Short event description"]
      ],
      "body": "<p>Paragraph text. Use <strong>bold</strong> for key names, <em>italics</em> for Japanese terms.</p>"
    }
  ],
  "terms": [
    ["Term", "Definition"]
  ],
  "quiz": [
    {
      "q": "Question text?",
      "opts": ["Option A", "Option B", "Option C", "Option D"],
      "ans": 0,
      "exp": "Explanation of the correct answer."
    }
  ],
  "sources": [
    { "text": "Author, First. Book Title. Publisher, Year." },
    { "text": "Article or website title", "url": "https://example.com" }
  ]
}
```

### Field Reference

| Field | Notes |
|---|---|
| `id` | Unique string, no spaces (e.g. `"meijiEra"`). Used internally only. |
| `num` | Display number string (e.g. `"11"`). Used in the sidebar and breadcrumb. |
| `jp` | Japanese text for chapter card. Can leave as `""` if unsure. |
| `sections` | Array of 1-4 sections. Each needs `h2` and `body`. `dates[]` is optional. |
| `body` HTML | Allowed tags: `<p>` `<h3>` `<strong>` `<em>` `<div class='callout'>` `<ul>` `<li>` |
| `terms` | Array of `["Term", "Definition"]` pairs. Aim for 6-10. |
| `quiz` | Array of question objects. Aim for 5 questions per chapter. |
| `ans` | Zero-indexed integer (0 = first option, 1 = second, etc.) |
| `dates` | Each date is `["Label", "Event text"]`. Label can be a year or range. |
| `sources` | **Optional.** Array of source objects — see below. Omit the field entirely if a chapter has no sources yet. |

### Adding Sources

Each entry in `sources` is an object with a required `text` field and an optional `url` field:

```json
"sources": [
  { "text": "Totman, Conrad. A History of Japan. Blackwell, 2000." },
  { "text": "Encyclopaedia Britannica — Jōmon culture", "url": "https://www.britannica.com/topic/Jomon-culture" }
]
```

- `text` — the full citation as you want it displayed. Any citation style works (APA, Chicago, etc.).
- `url` — optional. When present, the citation becomes a clickable link opening in a new tab.

The section is only rendered for chapters that have a `sources` array. Chapters without it are unaffected.

### To Edit Existing Content

Find the chapter in `chapters.json` by its `"name"` or `"id"` field. Edit the `"body"`, `"terms"`, or `"quiz"` fields as needed. The body field accepts HTML.

Use a JSON validator (e.g. jsonlint.com) if you get a blank screen after editing.

### To Change Visual Styles

Edit the CSS variables at the top of `styles.css`:

```css
--ink    : main text colour
--paper  : background colour
--aged   : sidebar / card background
--red    : accent colour (headings, active states)
--gold   : completion indicator colour
```