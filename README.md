# BiteSizedUtilities

A warm, waffle-kitchen toolbox of **42 small utilities and 11 arcade games across 8
cupboards** — and a real in-browser **WaffleCode IDE** that runs thirteen programming
languages with no server and no network.

Everything happens on your machine. Nothing is uploaded, there is no account, no
analytics, and no advertising. Load the page once and every tool keeps working offline.

---

## What's inside

### 🧮 Cupboard 1 — Math (15 tools)
Calculator, scientific calculator, graphing calculator, unit converter, percentage
tools, fraction work, number bases, statistics, and more. Built on `mathjs` with a
KaTeX-rendered help sheet.

### 💻 Cupboard 2 — Coding (15 tools)
The centrepiece is **WaffleCode IDE (#1)** — a full editor with syntax highlighting
(CodeMirror 6), dark/light theme packs, a file tree, a package manager, and a bundled
interpreter for each language:

| Language | Highlights |
| --- | --- |
| Python | classes, inheritance & `super()`, comprehensions (list/dict/set/generator), lambdas, slices, f-strings, exceptions, `import math/json/re/…`, dict & set semantics |
| JavaScript / TypeScript | via `sucrase`, with a module shim |
| C / C++ / Java / C# / Kotlin / Dart / Swift | shared C-family runtime — pointers & references, structs, arrays, `switch`, `do/while`, casts, C++ streams and `vector`, range-`for`, recursion |
| Rust / Go / Zig | line-oriented dialect support |
| Lua / Luau | tables, metatables, string library, closures |
| Scheme | macros, `cond`, tail-recursive helpers |
| Haskell | guards, pattern matching (incl. `(x:xs)`), list comprehensions, sections like `(*2)`, curried builtins, `foldr`/`foldl`/`map` |
| Prolog | full solver with backtracking, recursion, arithmetic, list unification (`[H\|T]`), multi-solution answers |
| Forth | stack words, `DO…LOOP`, `BEGIN…UNTIL/WHILE`, variables, `."` strings |
| Bash | a genuine shell: functions, `if/elif/else`, `for`/`while`/`until`/`case`, pipes, `$(( ))`, brace expansion, and ~25 coreutils builtins |
| Brainfuck | tape-limited interpreter with step output |
| SQL and WebAssembly | `sql.js` and `wabt` |

The other fourteen coding utilities: JSON/YAML formatter, regex tester, code diff
checker, JWT decoder, Base64/URL encoder, hash generator, UUID & password generator,
cron parser, CSS layout playground, CSS effects studio, timestamp converter, markdown
editor, Unicode inspector, and lorem ipsum generator.

### 📄 Cupboard 3 — Text & Files (15 tools)

The file-heavy cupboard, and the only one that opens documents. Everything is parsed in
memory; nothing is ever uploaded.

| Tool | What it really does |
| --- | --- |
| **Universal File & Batch Photo Converter ★** | PDF → PNG/JPG/WEBP at **72 / 150 / 300 / 600 DPI** via `pdfjs-dist`, image ↔ image with resize, images → PDF via `pdf-lib`, whole batch → ZIP via `jszip` |
| **PDF Merger / Splitter / Organizer** | Merge any number of PDFs, reorder / rotate / delete pages, export merged or one file per page |
| **Crazy Text Filters** | 19 Unicode filters — Zalgo (adjustable intensity), upside-down, vaporwave, fraktur, script, double-struck, circled, small caps, super/subscript, strike/slash-through |
| **Bulk Image Compressor & Resizer** | Max-dimension + quality + format controls with a draggable **before/after slider** |
| **Word / Char / Reading Time Counter** | Live counts, reading & speaking time at configurable WPM, Flesch reading ease, keyword + bigram density |
| **Case Converter & Cleaner** | 12 cases (sentence → CONSTANT_CASE) plus whitespace, punctuation, diacritic and HTML scrubbing |
| **Batch File Renamer & ZIP Packer** | `{name} {n} {ext} {date} {rand}` token templates, sortable live preview, collision detection, ZIP output |
| **CSV ↔ JSON ↔ Table Viewer** | RFC-4180 parser (quoted fields, escaped quotes, CRLF), delimiter choice, type detection, paginated preview |
| **QR & Barcode Generator + Scanner** | QR for text/URL/Wi-Fi/vCard/email/SMS/phone with EC levels and live styling; scans via webcam or image with `jsqr` |
| **Find / Replace & Regex Transformer** | Literal or regex, capture groups, flag toggles, live highlighting, per-match preview, 8 presets |
| **OCR Extractor** | `tesseract.js` (loaded on first use), 7 languages, grayscale + contrast preprocessing, confidence score |
| **EXIF Stripper / Inspector** | Hand-written TIFF/EXIF reader for JPEG APP1 and PNG `eXIf`, GPS shown on a map link, clean re-encode |
| **Cipher / Morse / Caesar Translator** | Morse with real **WebAudio** playback, Caesar brute-force table, ROT13, Atbash, A1Z26, binary, hex, Base64 |
| **Duplicate Line & Word Frequency Analyzer** | Dedupe with case/trim/empty options plus sortable frequency charts |
| **Notepad with Auto-Save** | Multi-note pad persisted to `localStorage`, dirty-state indicator, in-note search, `.txt` export |

### 🎮 Cupboard 8 — Games & Fun (11 local arcade cartridges)

Every game ships as a **self-contained HTML file in `public/games/`** and runs in a
sandboxed iframe with no network access: 2048, Trap the Cat, Wordle Unlimited, Sand Game,
Fluid Simulator, Offline Paradise, Radius Raid, It's Raining Boxes, Ninja vs Evil Corp,
Agar.io Lite, and Paper.io 2. A shelf view filters them by genre.

### The rest of the kitchen

Cupboards 4–7 (Art, Media, Science, Music) still read "Baking Soon". Alongside the tools
there's a **Hall of Fame** board (star any tool with ⋮), pinning to float tools to the top
of a cupboard, a **Settings** panel (kitchen Main/Accent colours plus a **Potato mode**
that drops texture, shadow and animation for weak devices), favourites ("My Lunchbox"), a
command palette (`Ctrl/⌘ + K`), a splash screen, a waffle mascot, and a local-only chat
drawer.

## Privacy

There are no accounts, no telemetry and no third-party requests at runtime. The only time
the app reaches the network is the first time you use **OCR**, which downloads the
tesseract engine and the language pack you selected; after that the browser caches them
and the tool runs offline.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-checks, then emits dist/
```

`npm run build` runs `tsc -b` first, so a type error fails the build rather than
shipping broken code. Deploy the contents of `dist/` to any static host — there is no
server component.

## Design notes

The visual language is deliberately toy-like: chunky rounded cards, soft drop shadows
lighting from the top-left, a waffle-grid backdrop, cream and cocoa tones, and a
handful of gentle sound effects (all synthesised with the Web Audio API, so there are
no audio files to download). Tool state lives in each tool; the shell only draws the
frame. Pins, favourites and chat history persist in `localStorage` / IndexedDB.

## Privacy

No requests leave the browser — not for fonts or telemetry, not even
for the interpreters, which are ordinary TypeScript bundled with the app. Large
libraries (KaTeX, CodeMirror, `sql.js`, `wabt`, `wllama`) are code-split so the first
paint stays small.
