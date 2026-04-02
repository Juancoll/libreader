# LibReader — Comprehensive Test Plan

Last updated: 2026-03-30

## Automated Tests (Current: 263 tests, 10 files)

### Existing Coverage
| File | Tests | What it covers |
|------|-------|---------------|
| `annotationService.test.ts` | 72 | CRUD, queries, migration, linking, export |
| `VoiceCommentsPanel.test.tsx` | 14 | Render, recording flow, playback, delete |
| `libraryStore.test.ts` | 16 | Zustand store actions, persistence |
| `useFilteredItems.test.ts` | 20 | Sorting, filtering, folder scoping |
| `BookCard.test.tsx` | 27 | Grid/list rendering, cover display |
| Other 5 files | 114 | Various service/component tests |

### Recommended New Automated Tests
- [ ] `annotationService.test.ts`: Add tests for `linkVoiceToAnnotation` / `unlinkVoiceFromAnnotation` round-trip
- [ ] VoiceCommentsPanel: Test `onAutoCreateAnnotation` callback fires when no `annotationId` and recording stops
- [ ] Progressive library loading: Test `appendItems` action, `onBatch` in vaultParser
- [ ] AnnotationsPanel: Test bookmark/highlight rendering, delete, note editing
- [ ] Tap zone config: Test `getTapZoneAction()` returns correct actions for each zone

---

## Manual Test Plan — Per-Reader Feature Matrix

### How to use this plan
1. Open a book/comic/video of the appropriate format
2. Check each feature in the matrix below
3. Mark Pass/Fail/NA
4. Test on both desktop (mouse) and tablet (touch) if possible

---

### 1. ComicReader (CBZ/CBR)

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| 1.1 | Open CBZ | Open a .cbz comic from library | Pages load, first page displayed |
| 1.2 | Open CBR | Open a .cbr comic from library | Pages load (WASM extraction) |
| 1.3 | Paged navigation (tap) | Tap left/right halves of middle zone | Previous/next page with flash arrow |
| 1.4 | Paged navigation (swipe) | Swipe left/right | Previous/next page |
| 1.5 | Paged navigation (keys) | Arrow keys or A/D | Previous/next page |
| 1.6 | Scroll mode (vertical) | Switch to scroll-v in settings | Vertical scroll, lazy loading |
| 1.7 | Scroll mode (horizontal) | Switch to scroll-h in settings | Horizontal scroll |
| 1.8 | Single/dual page layout | Toggle in settings | Layout changes, position preserved |
| 1.9 | LTR/RTL direction | Toggle direction | Navigation direction reversed |
| 1.10 | Pinch-to-zoom | Pinch gesture on touch device | Smooth zoom in/out |
| 1.11 | UI auto-hide | Wait 3s without interaction | Top/bottom bars fade out |
| 1.12 | UI show (tap center) | Tap top/bottom 20% zone | UI bars appear |
| 1.13 | Bookmark add | Press B or tap bookmark icon | Bookmark icon fills, bookmark saved |
| 1.14 | Bookmark remove | Press B again or tap icon on bookmarked page | Bookmark removed |
| 1.15 | Annotations panel | Tap annotations icon | Sidebar opens with bookmarks/highlights |
| 1.16 | Annotate mode (region) | Tap annotate icon, draw rectangle on page | Region overlay appears, color picker shown |
| 1.17 | Region annotation colors | Select different colors in picker | Region overlay changes color |
| 1.18 | Region annotation in scroll | Switch to scroll mode after adding region | Region overlays visible at correct positions |
| 1.19 | Delete annotation | Open panel, click delete on annotation | Annotation removed |
| 1.20 | Edit annotation note | Open panel, click edit, type note | Note saved and displayed |
| 1.21 | Voice recording | Open voice panel, press record | Recording starts, timer visible |
| 1.22 | Voice auto-annotation | Record without linking to existing annotation | Bookmark annotation auto-created with voice linked |
| 1.23 | Voice playback | Click play on saved voice comment | Audio plays back |
| 1.24 | Voice delete | Click delete on voice comment | Voice deleted |
| 1.25 | Position preservation | Switch view modes | Same page stays in view |
| 1.26 | Keyboard: Escape | Press Escape | Close panels, then close reader |
| 1.27 | Settings panel | Open settings | Layout, direction, render options visible |
| 1.28 | Progress bar | Navigate through pages | Progress bar updates in footer |
| 1.29 | Vault write-back | Close reader | `.reading/` dir created with state + bookmarks + annotations |

### 2. PdfReader

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| 2.1 | Open PDF | Open a .pdf from library | PDF renders on canvas |
| 2.2 | Paged navigation (tap) | Tap left/right halves of middle zone | Previous/next page with flash arrow |
| 2.3 | Paged navigation (swipe) | Swipe left/right | Previous/next page |
| 2.4 | Paged navigation (keys) | Arrow keys | Previous/next page |
| 2.5 | Scroll mode | Switch to scroll-v in settings | Vertical scroll, pages stack |
| 2.6 | Single/dual layout | Toggle in settings | Layout changes, position preserved |
| 2.7 | Render scale | Adjust scale slider in settings | Canvas resolution changes |
| 2.8 | Pinch-to-zoom | Pinch gesture on touch device | Smooth CSS zoom |
| 2.9 | **NO double-tap zoom** | Double-tap on page | Nothing happens (no zoom) |
| 2.10 | UI auto-hide | Wait 3s without interaction | Bars fade out |
| 2.11 | **Text selection** | Click and drag over text in PDF page | Text selects, highlight popup appears |
| 2.12 | **Text highlight** | Select text, pick color in popup | Text highlighted with chosen color |
| 2.13 | Highlight persistence | Reload page | Highlights still visible |
| 2.14 | Bookmark add/remove | Press B or toolbar icon | Bookmark toggled |
| 2.15 | Annotate mode | Press A or toolbar icon | "Modo anotar" indicator shown |
| 2.16 | Region annotation | In annotate mode, draw rectangle | Color picker → region overlay created |
| 2.17 | Annotations panel | Open sidebar | All bookmarks, highlights, regions listed |
| 2.18 | Note editing | Edit note on any annotation | Note saved |
| 2.19 | Voice recording | Open voice panel, record | Recording works, voice saved |
| 2.20 | Voice auto-annotation | Record without existing annotation link | Bookmark auto-created with voice attached |
| 2.21 | Voice playback/delete | Play and delete voice comments | Both work |
| 2.22 | Footer page controls | Use prev/next buttons in footer | Navigation works |
| 2.23 | Page number input | Type page number in footer | Jumps to page |
| 2.24 | Position preservation | Switch view modes | Same page stays in view |
| 2.25 | Keyboard: Escape | Press Escape | Close panels then reader |
| 2.26 | Vault write-back | Close reader | `.reading/` dir created correctly |

### 3. EpubReader

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| 3.1 | Open EPUB | Open a .epub from library | Book renders in iframe |
| 3.2 | Paginated nav (tap) | Tap left/right zones | Previous/next page with flash arrow |
| 3.3 | Paginated nav (swipe) | Swipe left/right | Previous/next page |
| 3.4 | Paginated nav (keys) | Arrow keys | Previous/next page |
| 3.5 | Scroll mode | Switch to scroll in settings | Continuous scroll rendering |
| 3.6 | Spread mode | Switch to spread | Two-page display |
| 3.7 | **NO double-tap zoom** | Double-tap on text | Nothing happens (no zoom) |
| 3.8 | Pinch-to-zoom | Pinch gesture | CSS zoom works |
| 3.9 | UI auto-hide | Wait 3s | Bars fade out |
| 3.10 | **Text selection** | Click and drag over text in EPUB | Text selects, highlight popup appears |
| 3.11 | **Text highlight** | Select text, pick color | CFI-based highlight applied |
| 3.12 | Highlight rendering | Navigate away and back | Highlights re-rendered correctly |
| 3.13 | Bookmark add/remove | Press B or toolbar icon | Bookmark toggled at current CFI |
| 3.14 | TOC panel | Open TOC | Chapter list shown, navigate on click |
| 3.15 | Settings panel | Open settings | Theme, font, size, margin controls |
| 3.16 | Theme (light/dark/sepia) | Switch themes | Reader background/text color changes |
| 3.17 | Font family | Change font | Text re-renders with new font |
| 3.18 | Font size / line height | Adjust sliders | Text reflows |
| 3.19 | Annotations panel | Open sidebar | Bookmarks + highlights listed |
| 3.20 | Note editing | Edit annotation note | Saved and displayed |
| 3.21 | Voice recording | Open voice panel, record | Voice saved |
| 3.22 | Voice auto-annotation | Record without linking | Bookmark auto-created with voice |
| 3.23 | Position preservation | Switch paginated ↔ scroll ↔ spread | Same position maintained (CFI-based) |
| 3.24 | Progress bar | Read through book | Progress percentage updates |
| 3.25 | Keyboard: Escape | Press Escape | Close panels then reader |
| 3.26 | Vault write-back | Close reader | `.reading/` dir created correctly |

### 4. MarkdownViewer

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| 4.1 | Open .md | Open a markdown note from library | Rendered markdown displayed |
| 4.2 | Obsidian wikilinks | Note with `[[Author]]` links | Rendered as bold text |
| 4.3 | Obsidian embeds | Note with `![[image.png]]` | Image tag rendered |
| 4.4 | YAML frontmatter | Note with frontmatter | Frontmatter stripped from display |
| 4.5 | **Text selection** | Click and drag over text | Text selects, highlight popup appears |
| 4.6 | **Text highlight** | Select text, pick color | `<mark>` element wraps text |
| 4.7 | Highlight persistence | Navigate away and back | Highlights restored via offset matching |
| 4.8 | Bookmark add | Press B or toolbar icon | Scroll-position bookmark created |
| 4.9 | Annotations panel | Open sidebar | Bookmarks + highlights listed |
| 4.10 | Navigate to annotation | Click annotation in panel | Scrolls to highlight or position |
| 4.11 | Note editing | Edit annotation note | Note saved |
| 4.12 | **Voice recording** | Open voice panel, press record | Recording works |
| 4.13 | **Voice auto-annotation** | Record without linking | Bookmark auto-created with voice |
| 4.14 | Voice playback/delete | Play and delete | Both work |
| 4.15 | Keyboard: Escape | Press Escape | Close panels then reader |
| 4.16 | Vault write-back | Close reader | `.reading/` dir created |

### 5. VideoReader

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| 5.1 | Open .youtube | Open a YouTube video item | YouTube player loads and plays |
| 5.2 | Play/pause | Click play button or press Space | Video toggles play/pause |
| 5.3 | Seek (timeline) | Click on timeline bar | Video seeks to clicked position |
| 5.4 | Seek (keys) | Arrow left/right | Skip back/forward 10s |
| 5.5 | UI auto-hide | Wait 3s during playback | Controls fade out |
| 5.6 | Bookmark add | Press B or toolbar icon | Timestamp bookmark created |
| 5.7 | Bookmark dedup | Press B within 2s of existing | Existing bookmark toggled, not duplicated |
| 5.8 | Bookmark dots | Add bookmarks | Yellow dots appear on timeline |
| 5.9 | Annotation flow | Press A → video pauses at start time | Start time captured |
| 5.10 | Annotation end | Press A again → video pauses | End time captured, color picker shown |
| 5.11 | Annotation color | Pick color | Time-range annotation created with color |
| 5.12 | Annotation bar | During playback | Colored bar visible on timeline for range |
| 5.13 | Active annotation | Playback enters annotation range | Colored banner overlay shown |
| 5.14 | Annotations panel | Open sidebar | Bookmarks + time-range annotations listed |
| 5.15 | Note editing | Edit annotation note | Saved |
| 5.16 | Voice recording | Open voice panel, record | Voice saved |
| 5.17 | Voice auto-annotation | Record without linking | Bookmark auto-created at current time with voice |
| 5.18 | Voice playback/delete | Play and delete | Both work |
| 5.19 | Position persistence | Close and reopen video | Resumes at last position |
| 5.20 | Keyboard: Escape | Press Escape | Close panels then reader |
| 5.21 | Vault write-back | Close reader | `.reading/` dir created |

### 6. Library & Navigation

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| 6.1 | Welcome screen | Open app without vault | Welcome shown with button to select vault |
| 6.2 | Select vault | Click "Seleccionar carpeta" | File picker opens, vault loads |
| 6.3 | Progressive loading | Select vault with many items | Items appear progressively, loading indicator |
| 6.4 | Grid view | Default view | Items in grid with covers |
| 6.5 | List view | Toggle view mode | Items in list format |
| 6.6 | Search | Type in search bar | Items filtered by title/author |
| 6.7 | Sort options | Change sort (title, author, date) | Items reorder |
| 6.8 | Filter chips | Click format filter (PDF, EPUB, etc.) | Only matching items shown |
| 6.9 | Folder navigation | Click folder in sidebar | Folder page with scoped items |
| 6.10 | Item detail page | Click item card | Detail page with metadata + reader launch |
| 6.11 | Settings page | Navigate to settings | Vault, folders, theme options |
| 6.12 | Theme switching | Toggle light/dark/system | Theme applies globally |
| 6.13 | Vault reconnection | Reload page | Vault auto-reconnects via IndexedDB |
| 6.14 | Cover display | View items with covers | Covers load from vault |
| 6.15 | CBZ cover extraction | View comic without separate cover | Cover extracted from CBZ first image |

---

## Cross-Cutting Concerns

| # | Feature | Applies to | How to test |
|---|---------|-----------|-------------|
| C.1 | Ctrl+wheel = browser zoom only | All readers | Ctrl+scroll wheel | Browser zooms, not app |
| C.2 | `object-fit: contain` on comics | Comic | Verify images never crop |
| C.3 | Tap zones: horizontal bands | Comic, PDF, EPUB | Top/bottom = toggle UI, middle = prev/next |
| C.4 | UI auto-hide 3s | Comic, PDF, EPUB, Video | Wait 3s |
| C.5 | Escape closes everything | All | Press Escape multiple times |
| C.6 | Position preservation on mode switch | Comic, PDF, EPUB | Switch modes, verify position |
| C.7 | Annotations saved to localStorage | All | Check `libreader:annotations:*` keys |
| C.8 | Vault write-back on close | All | Check `.reading/` directory after close |
| C.9 | No file deletion/movement | All | App never deletes vault files |
| C.10 | Voice auto-annotation | All 5 readers | Record voice → bookmark created automatically |

---

## Regression Checklist (after any change)

```bash
bunx tsc --noEmit        # 0 errors
bunx vitest run           # 263+ tests pass
bun run build             # Production build succeeds
```

Then manually verify the specific reader(s) affected by the change.
