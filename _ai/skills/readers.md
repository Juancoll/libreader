# LibReader — Readers

Four reader components, all lazy-loaded via `React.lazy()` in `BookDetailPage.tsx`.
Plus the MarkdownViewer (embedded, not fullscreen) and VideoReader (fullscreen YouTube player).

## Shared: Tap Zones (`src/components/reader/tapZones.ts`)

All three main readers import `getTapZoneAction` from this shared module.

```
┌──────────────────────────┐
│     TOGGLE UI (top 20%)  │  relY < ZONE_TOP_END (0.2)
├────────────┬─────────────┤
│            │             │
│  PREVIOUS  │    NEXT     │  middle 60%, split at ZONE_MID_SPLIT (0.5)
│            │             │
├────────────┴─────────────┤
│   TOGGLE UI (bottom 20%) │  relY > ZONE_BOTTOM_START (0.8)
└──────────────────────────┘
```

Constants are exported so proportions are easy to change.

## Shared: Gesture System

All three readers (Comic, PDF, EPUB) implement the same gesture patterns:

| Gesture | Condition | Behavior |
|---------|-----------|----------|
| **Tap** | Single pointer, minimal movement | Delegates to `getTapZoneAction()` |
| **Swipe** | dist > 50px, elapsed < 500ms, angle < 1 | Navigate prev/next (only when `zoom <= 1`) |
| **Double-tap** | Two taps within 350ms | Toggle zoom between 1x and 2.5x |
| **Pinch-to-zoom** | Two fingers | Scale proportional to finger distance (MIN=1, MAX=5); simultaneous center-point panning |
| **Pan** | Single finger when `zoom > 1` | Moves viewport via pointer capture |
| **2-finger → 1-finger** | Lift one finger while zoomed | Seamless transition from pinch to pan |

Key implementation details:
- `touchAction: 'none'` on container in paged modes to prevent browser interference
- Ctrl+wheel is NEVER intercepted (browser zoom passthrough)
- Zoom resets on page/mode/layout change
- CSS transform: `scale(${zoom}) translate(${pan.x/zoom}px, ${pan.y/zoom}px)`

## Shared: UI Auto-Hide

All three readers follow the same pattern:

- `showUI` state (boolean, default `true`)
- `uiTimeoutRef` ref for timeout handle
- `scheduleHideUI()` — clears existing timeout, sets 3-second auto-hide
- Auto-hide pauses when any panel is open (settings, TOC, annotations, voice)
- Header/footer are `position: absolute` with `translate-y` + `opacity` CSS transitions
- Progress bar is `position: absolute`, tracks header position

---

## ComicReader (`src/components/reader/ComicReader.tsx`, ~1498 lines)

Reads CBZ (fflate) and CBR (libarchive.js, dynamic import).

Extracted modules:
- `comicUtils.ts` (~49 lines) — `getImageContentRect()`, `findImgElement()`
- `ComicScrollUnits.tsx` (~208 lines) — `ScrollUnitV`, `ScrollUnitH` with region overlays
- `ComicIcons.tsx` (~56 lines) — 6 SVG icon components

### View Modes
- **NavMode:** `'paged'` | `'scroll-v'` | `'scroll-h'`
- **PageLayout:** `'single'` | `'dual'` (combinable with any nav mode)
- **ReadingDirection:** `'ltr'` | `'rtl'` (reverses navigation + horizontal scroll)

### Zoom
- CSS transform zoom only (no render scale)
- `MIN_ZOOM=1`, `MAX_ZOOM=5`, `DOUBLE_TAP_ZOOM=2.5`
- Resets on page navigation (`goToPage`)

### Tap Handling
- Uses `handleTapZone(clientX, clientY)` → `getTapZoneAction()`
- When `zoom > 1`, any tap just toggles UI (skips zone logic)
- ComicReader has a 300ms delayed single-tap (to disambiguate from double-tap)

### Panels
| Panel | Position |
|-------|----------|
| Settings | Overlay dropdown, top-right |
| Annotations | Sidebar, left, `w-80` — bookmarks + region highlights + inline note editing |
| Voice Comments | Overlay dropdown, top-right |
| Page Slider | Inline in bottom bar |

### Annotation System
- **Annotate mode**: toggle via toolbar button or `A` key (paged-single mode only)
- **Region selection**: pointer down/move/up on image → drag rectangle → color picker popup
- **Region overlays**: colored rectangles positioned at actual image content bounds (precision letterboxing)
- **Precision letterboxing**: `getImageContentRect()` + `contentAreaPct` state + `ResizeObserver` + `img.onload` tracking
- **Scroll mode overlays**: `ScrollUnitV` and `ScrollUnitH` render region overlays on their images
- **Bookmarks**: position-based (page number), toggle via toolbar
- **`useEffect` auto-disables annotateMode** when switching away from single-paged mode
- Pages are 0-indexed internally, 1-indexed in annotations (`position.index`)

### Position Preservation
- On `navMode` or `pageLayout` change: finds display unit containing current page, double `requestAnimationFrame`, then `scrollIntoView({ behavior: 'instant' })`

### Quirks
- 0-indexed pages internally, 1-indexed in annotations
- `buildSpreads()` from `comicParser.ts` creates dual-page spreads
- Image preloading: 4 ahead, 2 behind in paged mode
- Scroll units use `IntersectionObserver` with lazy loading + placeholder sizing
- Dark background (`bg-black`)
- Images always `object-fit: contain` (no fit mode selector)
- Saves via `writeAllReadingData` on close (reading state + annotations)

---

## PdfReader (`src/components/reader/PdfReader.tsx`, ~1609 lines)

Uses `pdfjs-dist` with web worker for canvas-based rendering + text layer for selection/highlights.

### View Modes
- **NavMode:** `'paged'` | `'scroll-v'` (no horizontal scroll)
- **PageLayout:** `'single'` | `'dual'`
- No reading direction setting (always LTR)

### Zoom (Two Systems)
1. **Render scale** (`scale` state, 0.5–3.0, step 0.25, default 1.5): Controls canvas resolution
2. **CSS zoom** (`zoom` state, 1–5): Pinch/double-tap visual transforms (same as Comic)

### Text Layer
- Uses `TextLayer` class from `pdfjs-dist` (v5.5.207 exports it directly)
- Constructor: `new TextLayer({ textContentSource, container, viewport })`
- `textContentSource` comes from `page.getTextContent()`
- Renders transparent `<span>` elements positioned absolutely over the canvas
- Enables native browser text selection on rendered PDF pages
- Minimal text layer CSS in `src/index.css` (`.textLayer` class + spans + selection + endOfContent)
- `renderTextLayer()` helper returns `boolean` — `true` if page has text content, `false` if empty
- `textlessPagesRef` tracks pages without text content (Set of page numbers)
- Both `PdfPagedView` and `PdfScrollPage` render text layers

### Highlight System
- 5 colors (yellow, green, blue, red, purple) — same `HIGHLIGHT_COLORS` as EPUB
- Highlight ID format: `page:startItemIdx:startCharOffset:endItemIdx:endCharOffset` (no CFI in PDFs)
- Selection detection via `resolveSelection()` — maps browser `Selection` to page/span indices using `range.intersectsNode()`
- Selection popup: floating color picker positioned near selected text (same UX as EPUB)
- `applyHighlightsToTextLayer()` applies `backgroundColor` styles to text layer spans
- Highlights re-applied after each text layer render
- Persisted in localStorage: `libreader:pdf:{filePath}:highlights`

### Bookmark System
- Page-based bookmarks (stores page number + timestamp)
- Toggle via `B` key or toolbar bookmark button
- Current page bookmark state shown in top bar
- Persisted in localStorage: `libreader:pdf:{filePath}:bookmarks`

### Tap Handling
- `handlePointerUp` uses `getTapZoneAction()` for pointer-event taps
- **Additionally** has invisible `<button>` overlay elements matching the same tap zone layout
- No delayed single-tap timer (unlike ComicReader)
- Has `navFlash` feedback: animated chevron icon appears briefly after navigation

### Panels
| Panel | Position | Content |
|-------|----------|---------|
| Settings | Inline in top bar | (no separate panel) |
| Annotations | Sidebar, left, `w-80` | Bookmarks list + text highlights + region highlights with delete + inline note editing |
| Voice Comments | Sidebar, left, `w-80` | Recording/playback UI |

All panels mutually exclusive (opening one closes others).

### Annotation System
- **Text highlights**: 5 colors, span-index-based IDs, selection via `resolveSelection()` → `AnnotationPopup`
- **Region annotations (annotate mode)**: for text-less pages, toggle via toolbar or `A` key (paged mode only)
  - Pointer down/move/up → drag rectangle → `pendingRegion` popup with color picker
  - `AnnotateModeIcon` custom SVG icon in toolbar
  - Annotate mode indicator pill shown when active
- **Region overlays**: rendered on both `PdfPagedView` and `PdfScrollPage`
- **`textlessPagesRef`**: tracks pages without text content (populated by `renderTextLayer()`)
- **Inline note editing**: via shared `AnnotationsPanel` with `InlineNoteEditor`

### Keyboard Shortcuts
- `Escape` cascade: selectionPopup → pendingRegion → annotations → voicePanel → close reader
- `B` — toggle bookmark on current page
- `A` — toggle annotate mode (paged mode only)

### Position Preservation
- On `navMode` change: double `requestAnimationFrame`, scrolls to `[data-page-num="${currentPage}"]`

### Quirks
- 1-indexed pages
- Theme-aware background (`bg-surface`)
- Separate page components: `PdfPagedView` (paged) and `PdfScrollPage` (scroll)
- Dual layout in scroll mode: even pages skipped (render as right-side canvas)
- Metadata title extracted from PDF info dict
- `showAnnotations` pauses UI auto-hide (same pattern as EPUB)
- Saves via `writeAllReadingData` on close (reading state + bookmarks + highlights)

---

## EpubReader (`src/components/reader/EpubReader.tsx`, ~1167 lines)

Uses `epubjs` for iframe-based EPUB rendering.

### View Modes
- **ViewMode:** `'paginated'` | `'scroll'` | `'spread'` (no separate layout setting)

### Rich Settings
- **Themes:** `'light'` | `'dark'` | `'sepia'` (custom body/bg/text/link colors)
- **Fonts:** Georgia, Literata, Sans-serif, Monospace
- **Font size:** 60%–200%
- **Line height:** 1.0–2.5
- **Margin:** 0–80px
- All settings per-book persisted in localStorage

### Tap Handling
- `handlePointerUp` on wrapper div → `getTapZoneAction()`
- Invisible `<button>` overlay elements (paginated/spread only, disabled when zoomed)
- **iframe click handler** via `rendition.on('click', onIframeClick)`:
  - Maps iframe-relative coordinates to absolute: `absX = iframeRect.left + event.clientX`
  - Passes absolute coords to `getTapZoneAction(absX, absY, wrapper.getBoundingClientRect())`
  - Ignores clicks when user has text selected
  - Only active when `viewMode !== 'scroll'`
- Has `navFlash` feedback (themed chevron icons)

### CFI Position System
- Location changes saved as CFI strings to localStorage
- On load: `rendition.display(savedCfi)`
- On view mode change: capture CFI → change flow/spread → 100ms timeout → `rendition.display(cfi)`
- Progress: `book.locations.percentageFromCfi(cfi)` / `cfiFromPercentage(pct)`
- Location generation: `book.locations.generate(1024)` (1024 chars per unit)

### Highlight System
- 5 colors (yellow, green, blue, red, purple)
- `rendition.annotations.highlight(cfi, ...)` / `.remove(cfi, 'highlight')`
- Selection popup: floating color picker near text selection
- Selection via `rendition.on('selected')`, position calculated relative to viewer div
- Highlights restored on load via `restoreHighlights()`

### Bookmark System
- Stores CFI + chapter name + percentage + timestamp
- Deduplicates by CFI
- Toggle from top bar

### Panels
| Panel | Position | Content |
|-------|----------|---------|
| Settings | Sidebar, left, `w-80` | Theme, view mode, font, font size, line height, margin |
| TOC | Sidebar, left, `w-72` | Flattened nav items with indent levels |
| Annotations | Sidebar, left, `w-80` | Bookmarks + highlights with delete + inline note editing |
| Voice Comments | Sidebar, left, `w-80` | Recording/playback UI |

All panels mutually exclusive (opening one closes others).

### Quirks
- `handleCloseRef` pattern avoids stale closure in keyboard effect
- Theme applied via `rendition.themes.select()` / `.fontSize()` / `.font()` / `.override()`
- View mode switching uses `rendition.flow()` and `rendition.spread()` (no re-creation)
- Saves via `writeAllReadingData` on close (reading state + annotations)

---

## MarkdownViewer (`src/components/reader/MarkdownViewer.tsx`, ~502 lines)

Markdown reader with full annotation support, embedded in BookDetailPage.

- Uses `react-markdown` + `remark-gfm` + `rehype-raw`
- Preprocessing: strips YAML frontmatter, converts Obsidian wikilinks to bold, converts `![[image.png]]` embeds to standard images
- Tailwind prose styling with detailed overrides
- Header with bookmark and annotations toolbar buttons

### Annotation System
- **Text selection**: offset resolution via TreeWalker (walks all text nodes in rendered `<article>`)
- **Highlight rendering**: `highlightRange()` splits text nodes and wraps segments in `<mark>` elements with `data-md-hl` attribute
- **`normalize()` called after clearing highlights** — prevents text node fragmentation
- **`AnnotationPopup`** for color picking on selection
- **`AnnotationsPanel`** sidebar with bookmarks + highlights + inline note editing
- **Bookmarks**: scroll position-based (`fraction` = scrollTop / scrollHeight)
- **Vault write-back** via `writeAllReadingData`

### Quirks
- Not a full-screen reader — embedded in BookDetailPage as a note viewer
- `'md'` added to `ReadingState.format` type and `detectFormatFromPath`
- TreeWalker computes character offsets relative to total text content in `<article>`

---

## VideoReader (`src/components/reader/VideoReader.tsx`, ~726 lines)

Reads `.youtube` files (plain text containing a YouTube URL). Uses the YouTube IFrame API
for playback in a fullscreen UI.

### Key Features
- **YouTube IFrame API** loaded as singleton (script injected once, callbacks queued)
- **URL parsing**: supports `youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/embed/ID`, and bare 11-char IDs
- **Custom controls**: play/pause, skip +-10s, clickable timeline, no native YouTube controls
- **Position persistence**: saved to `localStorage` every 500ms via polling interval; restored on reopen
- **UI auto-hide**: 3s timeout during playback, resets on mouse move
- **Click overlay**: transparent div above iframe captures clicks for play/pause toggle

### Annotation System
- **Time-range annotations**: `timeStart`/`timeEnd` in seconds
- **Annotation creation flow**:
  1. Press `A` → video pauses → marks start time
  2. User plays/seeks to desired end point
  3. Press `A` again → marks end time → color picker appears
  4. Pick color → annotation saved
- **Active annotation overlay**: colored banner at top of video when playback enters a time range
- **Bookmarks**: timestamp-based (nearest 2s dedup), displayed as yellow dots on timeline

### Timeline
- Progress bar with red fill + playhead dot
- Annotation ranges shown as colored bars on the track
- Bookmark dots (yellow) positioned by timestamp
- Green preview bar during annotation creation (marking-end phase)

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Space | Play/pause |
| B | Toggle bookmark at current time |
| A | Start annotation / confirm end |
| Left/Right arrows | Seek +-10 seconds |
| Escape | Cancel annotation / close panel / close reader |

### Vault Write-Back
- `state.json`: `currentPage` = seconds, `totalPages` = duration, `currentTime`, `duration`
- `bookmarks.json`: includes `timestamp` field (seconds)
- `annotations.md`: time ranges formatted as `[MM:SS - MM:SS]`

### Panels
- **`AnnotationsPanel`** sidebar (left) with bookmarks + highlights + inline note editing
- **`VoiceCommentsPanel`** sidebar (right) with `variant="panel"`
- Both toggle via header buttons, mutually exclusive

---

## Cross-Reader Comparison

| Feature | Comic | PDF | EPUB | Markdown | Video |
|---------|-------|-----|------|----------|-------|
| View modes | paged, scroll-v, scroll-h | paged, scroll-v | paginated, scroll, spread | N/A (scrollable article) | N/A (streaming) |
| Page layout | single, dual | single, dual | (spread is view mode) | N/A | N/A |
| Reading direction | ltr, rtl | N/A | N/A | N/A | N/A |
| Double-tap timer | 300ms delay | No delay | No delay | N/A | N/A |
| Render scale | N/A | 0.5–3.0 | N/A (font size) | N/A | N/A |
| Text layer | N/A | pdfjs TextLayer (selection) | iframe (native) | DOM (react-markdown) | N/A |
| Themes | Dark only | Theme-aware | light/dark/sepia | System | Dark only |
| Settings panel | Dropdown | Inline | Sidebar | N/A | N/A |
| TOC | N/A | N/A | Sidebar | N/A | N/A |
| Highlights | Region-based (image rect) | 5-color span-index + region fallback | 5-color, CFI-based | 5-color, offset-based | 5-color, time-range |
| Bookmarks | Page-based | Page-based | CFI-based | Scroll position-based | Timestamp-based |
| Annotations panel | Sidebar (bookmarks + regions + notes) | Sidebar (bookmarks + highlights + regions + notes) | Sidebar (bookmarks + highlights + notes) | Sidebar (bookmarks + highlights + notes) | Sidebar (bookmarks + highlights + notes) |
| Annotate mode | Yes (paged-single) | Yes (paged, for text-less pages) | N/A (text always selectable) | N/A (text always selectable) | Yes (A key start/end) |
| Nav flash | N/A | Chevrons | Chevrons | N/A | N/A |
| Page indexing | 0-based internal, 1-based annotations | 1-based | CFI (percentage) | Scroll fraction | Seconds (timeStart) |
| Vault save | writeAllReadingData | writeAllReadingData | writeAllReadingData | writeAllReadingData | writeAllReadingData |
