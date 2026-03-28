# PDF Smart Searching

Browser-based PDF/TXT token visualizer with linked query matching.
https://bluemoon012905.github.io/PDF-smart-searching/

## What It Does

- Drag and drop a `.pdf` or `.txt` anywhere on the screen
- Parse documents fully in-browser (no backend)
- Show PDF page previews plus extracted tokenized text
- Color-link matching tokens between document and query
- Click linked tags to turn matching on/off
- Rank pages by highest token hit count
- Click ranked pages to jump to that page in the viewer
- Show turtle mascot:
  - idle before upload
  - spinning while parsing/loading

## Query Modes

### Basic mode

- Single question textarea
- Tokenizes question terms
- Clickable token tags toggle overlap matching on/off

### Advanced mode

- Multiple filter boxes
- Each filter has a checkbox to include/exclude it
- Add/remove filters dynamically
- Uses checked filters as the active query source
- Linked tag chips can also toggle token inclusion on/off

## Current Matching Logic

- Tokenizes text using Unicode-aware token parsing
- Normalizes tokens to lowercase
- Filters a stop-word set for matching
- Links tokens by exact normalized overlap
- Uses tag on/off state to control highlighting and ranking
- Ranks pages by number of enabled linked token occurrences on each page

## Tech Stack

- `index.html` + `styles.css` + `app.js` (no build step)
- `pdf.js` loaded from CDN for PDF extraction/rendering
- Fully static-host compatible

## Local Run

From project root:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Notes / Limitations

- Best with text-based PDFs
- Scanned/image-only PDFs do not include OCR yet
- Parsing large PDFs may be slower on low-power devices

## Project Files

- `index.html`: app layout and panels
- `styles.css`: visual styling, layout, animations
- `app.js`: parsing, tokenization, linking, mode logic, ranking
- `turtle.png`: loading/idle mascot
