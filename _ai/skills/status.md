# LibReader — Project Status

Last updated: 2026-04-01

## What's Done

### Core Infrastructure
- [x] Vite + React + TypeScript + Tailwind v4 + Zustand + React Router setup
- [x] File System Access API integration (WebFSAdapter) with IndexedDB reconnection
- [x] Vault parser: scans folders, parses frontmatter, resolves covers, detects formats
- [x] Zustand store with localStorage persistence
- [x] Routing: Library, Item Detail, Folder, Settings pages
- [x] Layout: sidebar navigation, mobile header, theme support (light/dark/system)
- [x] Library grid/list views with search, sort, and filter
- [x] Welcome screen when no vault configured

### Readers
- [x] **ComicReader** (~1303 lines + extracted modules) — CBZ (fflate) + CBR (libarchive.js WASM)
  - Paged, vertical scroll, horizontal scroll modes
  - Single/dual page layouts, LTR/RTL direction
  - Pinch-to-zoom, double-tap zoom, swipe navigation
  - Tap zone navigation (horizontal bands)
  - UI toggle (pure toggle, no auto-hide timer)
  - Image preloading (4 ahead, 2 behind)
  - Scroll mode with IntersectionObserver + lazy loading
  - **Annotate mode**: rectangular region selection on images (paged-single only)
  - **Region annotations**: colored overlays in all view modes (paged + scroll)
  - **Precision letterboxing**: overlays positioned at actual image content bounds
  - **Bookmarks**: position-based, toggle via toolbar
  - **Annotations panel**: sidebar with bookmarks + highlights + inline note editing
  - Voice comments panel
  - Reading state + annotations saved to vault
  - Extracted: `comicUtils.ts`, `ComicScrollUnits.tsx`, `ComicIcons.tsx` (reader-specific only)
- [x] **PdfReader** (~1609 lines) — pdfjs-dist with web worker
  - Paged, vertical scroll modes
  - Single/dual page layouts
  - Render scale (0.5-3.0) + CSS zoom (pinch only, no double-tap zoom)
  - Tap zone navigation (horizontal bands, handled by pointer event handler)
  - Nav flash feedback (animated chevrons)
  - UI toggle
  - Text layer (pdfjs TextLayer) for native text selection
  - Highlight system (5 colors, span-index-based)
  - Bookmark system (page-based, toggle via B key or toolbar)
  - **Annotate mode**: region fallback for text-less PDF pages (toggle via toolbar or `A` key)
  - **Region annotations**: colored overlays on both paged and scroll views
  - **Text-less page detection**: `renderTextLayer()` returns boolean, `textlessPagesRef` tracks pages without text
  - Annotations panel (sidebar, bookmarks + highlights + regions with delete + inline note editing)
  - Voice comments panel (auto-creates annotations when recording)
  - Reading state + annotations saved to vault (writeAllReadingData)
- [x] **EpubReader** (~1167 lines) — epubjs (iframe)
  - Paginated, scroll, spread modes
  - Per-book themes (light/dark/sepia), fonts, font size, line height, margin
  - Tap zones handled by pointer handler + iframe click handler (no overlay buttons)
  - Nav flash feedback
  - UI toggle
  - Highlight system (5 colors, CFI-based)
  - Bookmark system
  - TOC panel, Settings panel, Annotations panel (with inline note editing)
  - Voice comments panel (auto-creates annotations when recording)
  - CFI position preservation across mode changes
  - Reading state + annotations saved to vault
- [x] **MarkdownViewer** (~502 lines) — react-markdown with Obsidian wikilink support
  - **Text selection annotations**: offset-based via TreeWalker
  - **Highlight rendering**: DOM manipulation with `<mark>` elements
  - **Bookmark support**: scroll position-based
  - **Annotations panel**: sidebar with bookmarks + highlights + inline note editing
  - **Voice comments panel** (auto-creates annotations when recording)
  - Vault write-back via `writeAllReadingData`
- [x] **VideoReader** (~726 lines) — YouTube IFrame API player
  - Fullscreen UI with custom controls (play/pause, skip, seekable timeline)
  - Time-range annotations with color picker (A key start/end flow)
  - Timestamp bookmarks with 2s dedup
  - Active annotation overlay (colored banner during playback)
  - Custom timeline with bookmark dots + annotation range bars
  - Position persistence (localStorage + vault write-back)
  - UI auto-hide (3s during playback)
  - Keyboard shortcuts: Space, B, A, arrows, Escape
  - Annotations panel (sidebar) + Voice comments panel
  - `.youtube` file format: plain text with YouTube URL
- [x] **Shared reader infrastructure**:
  - `useAnnotations` hook — unified annotation state management for all 5 readers
  - `ReaderIcons.tsx` — shared SVG icons (CloseIcon, BookmarkIcon, ChevronIcon, SearchIcon, AnnotationsDocIcon, AnnotationsBubbleIcon)
  - `tapZones.ts` — consistent horizontal band tap zone layout
  - `AnnotationPopup.tsx` — shared floating color picker
  - `AnnotationsPanel.tsx` — shared sidebar with bookmarks, highlights, inline note editing
  - `VoiceCommentsPanel.tsx` — shared voice comments UI
  - `useReaderUI`, `useReaderGestures`, `useReaderKeyboard` hooks
  - `useReaderStorage` — shared localStorage helpers + `formatDuration`

### Library UI
- [x] `ItemGrid` shared component — grid/list rendering, error/loading/empty states, FilterBar integration
- [x] `FilterBar` — search (debounced 250ms), sort, folder/status/tag filter chips, view mode toggle
- [x] `BookCard` / `BookListItem` — grid and list item components

### Data Persistence
- [x] Reading progress persisted in localStorage + vault `.reading/` dirs
- [x] Annotations writer (state.json, bookmarks.json, annotations.md, voice/)
- [x] Voice recording with MediaRecorder, base64 storage in vault
- [x] **Unified annotation system** — single `Annotation` type across all formats
- [x] Annotation service (CRUD, queries, legacy migration)
- [x] Voice comments linked to annotations via `voiceIds` / `annotationId`
- [x] Shared annotation components (AnnotationPopup, AnnotationsPanel)
- [x] Region annotations for Comics and PDF (rectangular 0-1 relative coordinates)
- [x] Text offset annotations for Markdown (TreeWalker-based)
- [x] Time-range annotations for Video (timeStart/timeEnd in seconds)
- [x] Inline note editing on all annotation types

### Code Quality Optimization (Phases 1-3 complete)
- [x] **Phase 1**: Critical cleanup (bugs + dead code removal)
- [x] **Phase 2**: DRY refactoring
  - `useAnnotations` hook (~219 lines) — eliminated ~400 lines duplicated across 5 readers
  - Unified icons into `ReaderIcons.tsx` (~90 lines) — eliminated ~70 lines across PdfIcons + ComicIcons
  - Extracted `ItemGrid` component (~98 lines) — eliminated ~90 lines duplicated between LibraryPage + FolderPage
  - Consolidated `formatDuration` and `loadFromStorage`/`saveToStorage` duplicates
- [x] **Phase 3**: Polish
  - StatsPage: replaced 8 hardcoded colors with theme tokens (bg-success, bg-primary, bg-danger, bg-text-muted, bg-accent, text-success, text-primary, text-text-muted)
  - FilterBar: debounced search input (250ms delay)
  - Memoized: FilterBar `scopedItems`, LibraryPage folder breakdown
  - Removed empty directories: `src/utils/`, `src/components/book/`, `src/components/common/`

### Tests
- [x] 255 unit tests passing across 10 files (Vitest)
- [x] 15 E2E tests (Playwright)

### Documentation (`_ai/`)
- [x] `_ai/context.md` — project overview
- [x] `_ai/skills/project-rules.md` — AI agent instructions
- [x] `_ai/skills/architecture.md` — code architecture
- [x] `_ai/skills/readers.md` — reader implementation details
- [x] `_ai/skills/annotations.md` — annotation system, storage formats, voice comments
- [x] `_ai/skills/decisions.md` — design decisions and rationale
- [x] `_ai/skills/status.md` — this file

### Scripts & Entry Points
- [x] `_ai/scripts/generate-agent-docs.sh` — generates CLAUDE.md and .github/copilot-instructions.md from skills
- [x] `scripts/check.sh` — runs typecheck + tests + build
- [x] `scripts/dev.sh` — starts dev server
- [x] `CLAUDE.md` — auto-generated entry point for Claude Code
- [x] `.github/copilot-instructions.md` — auto-generated entry point for GitHub Copilot

## Known Issues

- `textlessPagesRef` in PdfReader is write-only — populated but not yet read. Ready for auto-activate annotate mode feature.
- Region annotations only work in single-page paged mode (both Comic and PDF). Acceptable limitation.
- No double-tap zoom in PDF or EPUB (removed by user request). Pinch-to-zoom still works.

## What's Next

### Short Term
- Extract PdfReader components (bring under ~1500 lines)
- Auto-activate annotate mode on text-less PDF pages (use `textlessPagesRef`)
- Test gestures on tablet (user wants to verify before moving forward)
- Capacitor integration (iOS/Android native filesystem)

### Medium Term
- Search within EPUB/PDF content
- Reading statistics / progress dashboard

### Future
- Offline PWA support
- Sync reading state across devices
