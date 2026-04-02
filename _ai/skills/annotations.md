# LibReader — Annotation System

Complete documentation of the unified annotation system: types, storage, voice comments, vault file formats, and how to query them from outside LibReader.

---

## Overview

LibReader uses a **unified annotation system** that works across all content formats (EPUB, PDF, Comic CBZ/CBR, Markdown, and future video/audio). The core concept:

- A **highlight** is an annotation with a text selection or visual region
- A **bookmark** is an annotation with only a position (no text, no region)
- Any annotation can optionally have **text notes** and/or **voice comments** attached

The highlight's anchor varies by format:
- **EPUB**: CFI (Canonical Fragment Identifier)
- **PDF text**: text layer span indices + character offsets
- **PDF image / Comics**: rectangular region (relative 0-1 coordinates)
- **Markdown**: character offsets in raw content
- **Video/Audio** (future): time ranges in seconds

---

## Unified Annotation Type

```typescript
interface Annotation {
  id: string;                    // "ann_1719500000000_a1b2c3"
  position: DocumentPosition;    // WHERE in the document
  region?: SpatialRegion;        // WHAT AREA (for images/comics)
  textSelection?: TextSelection; // WHAT TEXT (for text content)
  style: HighlightStyle;         // HOW it looks
  note: string;                  // User-written text note ("" if none)
  voiceIds: string[];            // IDs of linked voice comments
  chapter?: string;              // Chapter/section name
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

### DocumentPosition — WHERE in the document

```typescript
interface DocumentPosition {
  index?: number;      // Page number (1-indexed for PDF/Comic)
  fraction?: number;   // Progress 0-1 relative to full document
  cfi?: string;        // EPUB CFI string (e.g. "epubcfi(/6/4!/4/2/1:0)")
  timeStart?: number;  // Video/audio start (seconds) — future
  timeEnd?: number;    // Video/audio end (seconds) — future
}
```

### SpatialRegion — WHAT AREA is marked (comics, PDF scans)

```typescript
interface SpatialRegion {
  x: number;  // X relative to page width (0-1)
  y: number;  // Y relative to page height (0-1)
  w: number;  // Width relative to page width (0-1)
  h: number;  // Height relative to page height (0-1)
}
```

### TextSelection — WHAT TEXT is highlighted

```typescript
interface TextSelection {
  text: string;             // The selected text content
  cfiRange?: string;        // EPUB: CFI range
  startItemIdx?: number;    // PDF: first text content item index in text layer
  startCharOffset?: number; // PDF: char offset within first item
  endItemIdx?: number;      // PDF: last text content item index
  endCharOffset?: number;   // PDF: char offset within last item
  startOffset?: number;     // Markdown: start offset in raw content
  endOffset?: number;       // Markdown: end offset in raw content
}
```

### HighlightStyle

```typescript
type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple';

interface HighlightStyle {
  color: HighlightColor;
  opacity?: number;  // 0-1, default 0.3
}
```

### Bookmark vs Highlight

A bookmark is an Annotation where `textSelection` and `region` are both absent:

```typescript
function isBookmark(annotation: Annotation): boolean {
  return !annotation.textSelection && !annotation.region;
}
```

---

## Storage

### Runtime storage: localStorage

Annotations are stored per-file in localStorage under a unified key:

```
Key:    libreader:annotations:{filePath}
Value:  JSON array of Annotation objects
```

Example key: `libreader:annotations:books/MyBook/MyBook.epub`

Legacy keys (pre-migration, still readable):
- EPUB: `libreader:{filePath}:highlights`, `libreader:{filePath}:bookmarks`
- PDF: `libreader:pdf:{filePath}:highlights`, `libreader:pdf:{filePath}:bookmarks`

The system auto-migrates from legacy keys on first load (non-destructive — old keys are kept).

### Vault persistence: `.reading/` directories

Each content file gets a `.reading/` sibling directory in the vault:

```
ItemFolder/
  ItemFile.epub
  ItemFile.epub.reading/
    state.json            # Reading position & progress
    bookmarks.json        # Bookmarks array
    annotations.md        # Highlights as Obsidian-compatible markdown
    voice/
      voice-comments.json # Voice comment index
      vc_17195_a1b2.webm.b64   # Audio as base64 text
      vc_17196_c3d4.webm.b64
```

---

## File Formats

### state.json

```json
{
  "file": "MyBook.epub",
  "format": "epub",
  "currentPage": 42,
  "totalPages": 300,
  "progress": 0.14,
  "lastRead": "2025-06-20T12:00:00.000Z",
  "epubCfi": "epubcfi(/6/4!/4/2/1:0)",
  "pageLayout": "single",
  "navMode": "paged",
  "readingDirection": "ltr",
  "zoom": { "level": 1, "mode": "fit" }
}
```

Fields by format:
- `epubCfi`: only for EPUB
- `pageLayout`: "single" | "double" — for PDF and Comic
- `navMode`: "paged" | "scroll" — for PDF
- `readingDirection`: "ltr" | "rtl" — for Comic
- `zoom`: for PDF

### bookmarks.json

```json
{
  "file": "MyBook.epub",
  "bookmarks": [
    {
      "id": "ann_17195_a1b2c3",
      "cfi": "epubcfi(/6/4!/4/2/1:0)",
      "page": null,
      "chapter": "Chapter 1",
      "percentage": 14,
      "createdAt": "2025-06-20T12:00:00.000Z"
    },
    {
      "id": "ann_17196_d4e5f6",
      "cfi": null,
      "page": 42,
      "chapter": "Pagina 42",
      "percentage": 14,
      "createdAt": "2025-06-20T13:00:00.000Z"
    }
  ]
}
```

- `cfi`: present for EPUB bookmarks, `null`/absent for PDF/Comic
- `page`: present for PDF/Comic bookmarks, `null`/absent for EPUB
- `percentage`: integer 0-100

### annotations.md

Obsidian-compatible markdown with frontmatter + callout syntax:

```markdown
---
file: "MyBook.epub"
format: epub
totalPages: 300
progress: 14%
lastRead: 2025-06-20T12:00:00.000Z
tags:
  - reading
  - epub
---

# MyBook.epub

## Progress

- **Current page**: 42 / 300
- **Progress**: 14%
- **Last read**: 2025-06-20

## Highlights

### Chapter 1

> [!quote] yellow
> The selected text goes here, preserving line breaks.

**Nota**: User's note about this highlight

*2025-06-20*
`epubcfi(/6/4[chap01]!/4/2,/1:0,/3:10)`

### Pagina 42

> [!quote] blue
> Another highlighted passage from page 42.

*2025-06-20*
```

- Highlights grouped by `chapter` field
- Colors: yellow, green, blue, red, purple
- CFI range appended as inline code for EPUB highlights
- For region-based annotations (comics), text reads `[Region X%,Y%]`

### voice-comments.json

```json
{
  "file": "MyBook.epub",
  "comments": [
    {
      "id": "vc_1719500000000_a1b2c3",
      "filePath": "books/MyBook/MyBook.epub.reading/voice/vc_1719500000000_a1b2c3.webm",
      "duration": 15,
      "location": "epubcfi(/6/4!/4/2/1:0)",
      "selectedText": "Optional quoted text the user was looking at",
      "annotationId": "ann_17195_a1b2c3",
      "createdAt": "2025-06-20T12:00:00.000Z"
    }
  ]
}
```

- `location`: format varies by reader:
  - EPUB: CFI string like `"epubcfi(/6/4!/4/2/1:0)"` or `"progress:14%"`
  - PDF: `"page:42"`
  - Comic: `"page:5"` (1-indexed)
- `selectedText`: optional, currently unused (reserved for future "voice annotate selected text")
- `annotationId`: optional, links this voice comment to a specific annotation. When present, the annotation's `voiceIds[]` array also contains this comment's `id`.
- `filePath`: path to the `.webm` audio. Actual file is at `{filePath}.b64` (base64-encoded).
- `duration`: integer, seconds

### Voice audio files (.webm.b64)

Audio is stored as **base64-encoded text files** (not raw binary), because the vault FSAdapter only supports string writes.

- Format: WebM/Opus (preferred) or OGG
- Path: `{file}.reading/voice/{id}.webm.b64`
- To decode: `atob(base64Content)` -> byte array -> Blob with type `audio/webm`

---

## Voice-Annotation Linking

Voice comments and annotations are **bidirectionally linked**:

1. `Annotation.voiceIds: string[]` — list of voice comment IDs attached to this annotation
2. `VoiceComment.annotationId?: string` — the annotation this voice comment belongs to

When a voice comment is recorded with an `annotationId`:
- The voice comment is saved with `annotationId` in `voice-comments.json`
- `linkVoiceToAnnotation()` adds the voice ID to the annotation's `voiceIds[]`

When a linked voice comment is deleted:
- `unlinkVoiceFromAnnotation()` removes the voice ID from the annotation's `voiceIds[]`
- The voice entry is removed from `voice-comments.json`

---

## Querying Annotations from Outside LibReader

To analyze annotations for a vault item from an external AI agent:

### 1. Find the `.reading/` directory

```
{vaultPath}/{folder}/{itemName}/{itemFile}.reading/
```

Example: `~/OneDrive/resources/library/books/Sapiens/Sapiens.epub.reading/`

### 2. Read the files

| File | Contains | Format |
|------|----------|--------|
| `state.json` | Reading position, progress, last read date | JSON |
| `bookmarks.json` | All bookmarks with location + chapter | JSON |
| `annotations.md` | All highlights with text, color, notes, chapter grouping | Markdown (Obsidian callout syntax) |
| `voice/voice-comments.json` | Voice comment index with locations and annotation links | JSON |
| `voice/*.webm.b64` | Audio files as base64 | Text (base64) |

### 3. Cross-reference annotations and voice comments

To find all voice comments for a specific annotation:
```
annotation.voiceIds -> look up each ID in voice-comments.json
```

To find the annotation a voice comment belongs to:
```
voiceComment.annotationId -> look up in annotations localStorage or bookmarks.json
```

### 4. Parse annotations.md for human-readable highlights

The markdown file uses Obsidian callout syntax (`> [!quote] color`). Each highlight block contains:
- The quoted text
- Optional `**Nota**: ...` line
- Date
- Optional CFI range in backticks

---

## Implementation Status

| Format | Highlights | Bookmarks | Regions | Notes | Voice Links | Vault Write-back |
|--------|-----------|-----------|---------|-------|-------------|-----------------|
| EPUB | Done (CFI) | Done (CFI) | N/A | Done | Done | Done |
| PDF (text) | Done (span-index) | Done (page) | N/A | Done | Done | Done |
| PDF (image) | N/A | Done (page) | Done (annotate mode) | Done | Done | Done |
| Comic (CBZ/CBR) | N/A | Done (page) | Done (annotate mode) | Done | Done | Done |
| Markdown | Done (text offset) | Done (scroll position) | N/A | Done | Done | Done |

---

## Source Files

| File | Purpose |
|------|---------|
| `src/types/annotation.ts` | Unified type definitions |
| `src/services/annotationService.ts` | CRUD, queries, linking, legacy migration |
| `src/services/annotationWriter.ts` | Vault write-back (state, bookmarks, annotations.md) |
| `src/services/voiceRecorder.ts` | Voice recording, save/load/delete in vault |
| `src/components/reader/AnnotationPopup.tsx` | Shared floating color picker |
| `src/components/reader/AnnotationsPanel.tsx` | Shared sidebar (bookmarks + highlights list) |
| `src/components/reader/VoiceCommentsPanel.tsx` | Shared voice recording/playback UI |
