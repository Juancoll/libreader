# LibReader — Design Decisions

Key decisions and their rationale, so future AI agents (and humans) understand why things are the way they are.

---

## No ContentType Enum

**Decision:** Content type is derived from file extensions (epub, pdf, cbz, cbr, md), never from an enum or folder-level config.

**Why:** The user has a flat vault structure where any folder can contain any format. Hardcoding categories or content types would be fragile and require maintenance when new formats or folder layouts appear. File extension detection is automatic and correct.

---

## VaultFolder Is Minimal

**Decision:** `{ name: string; path: string; showInMenu: boolean; showInLibrary: boolean }` — nothing else.

**Why:** The user explicitly requested no hardcoded categories. The UI derives behavior (which reader to open, which icon to show) from actual file extensions found in each item folder. Folders are just organizational containers.

---

## Dynamic Import for libarchive.js

**Decision:** `libarchive.js` must always be imported with `await import('libarchive.js')`, never a static import.

**Why:** Static import causes Vite's dependency optimizer to crash with "Outdated Optimize Dep" 504 errors. The library uses WASM + Web Worker, which conflicts with Vite's pre-bundling. Config also has `optimizeDeps: { exclude: ['libarchive.js'] }`.

---

## Custom Frontmatter Parser (not gray-matter)

**Decision:** Replaced `gray-matter` with a custom `parseFrontmatter()` using the `yaml` npm package.

**Why:** `gray-matter` pulls in Node.js built-ins (`Buffer`, `fs`) that don't work in the browser. The `yaml` package is browser-safe and lightweight.

---

## Horizontal Tap Zones (not Vertical Columns)

**Decision:** Tap zones are 3 horizontal bands (top 20% toggle UI, middle 60% prev|next split, bottom 20% toggle UI), not vertical columns.

**Why:** The user explicitly requested this layout. It works better on tablets and phones where the thumb naturally reaches the middle of the screen. Previous vertical layout (left 30% / center 40% / right 30%) was replaced.

---

## No Fit Mode Selector in Comic Reader

**Decision:** Comic images always use `object-fit: contain`. No user-facing setting to change this.

**Why:** User explicitly decided this. Cover-to-cover consistency matters more than per-page optimization. Pinch-to-zoom handles cases where the user wants to see detail.

---

## Ctrl+Wheel = Browser Zoom Only

**Decision:** The app never intercepts Ctrl+wheel. It always triggers the browser's native zoom.

**Why:** User explicitly requested this. Using Ctrl+wheel for in-app zoom conflicts with accessibility expectations. In-app zoom is handled by pinch and double-tap.

---

## Position Preservation Is Mandatory

**Decision:** Switching view modes (paged → scroll, single → dual, etc.) must preserve the current reading position in ALL readers.

**Why:** Losing your place is unacceptable UX. Each reader implements this differently:
- **Comic:** Finds display unit containing current page → `scrollIntoView` after double rAF
- **PDF:** Scrolls to `[data-page-num]` after double rAF
- **EPUB:** Captures CFI → changes flow/spread → restores via `rendition.display(cfi)` after 100ms

---

## Consistent Gesture System Across Readers

**Decision:** All three main readers implement the same tap zone layout, pinch-to-zoom, swipe, double-tap, and UI auto-hide behavior.

**Why:** User said "no quiero volver a revisar" (I don't want to revisit this). Consistency means the reader code behaves predictably regardless of format. Shared `tapZones.ts` ensures the zone layout stays in sync.

---

## CBZ Uses fflate (Synchronous), CBR Uses libarchive.js (WASM)

**Decision:** Two separate extraction paths instead of one unified library.

**Why:** ZIP extraction with `fflate` is fast, synchronous (`unzipSync`), and lightweight. RAR requires WASM-based decompression (no pure JS RAR decoder is practical). Using fflate for CBZ avoids the WASM overhead and dynamic import complexity for the common case.

---

## Two Zoom Systems in PDF Reader

**Decision:** PdfReader has both a render scale (canvas resolution, 0.5–3.0) and a CSS transform zoom (1–5x).

**Why:** PDF pages are rendered to canvas at a fixed resolution. Render scale controls text clarity. CSS zoom provides the same pinch/double-tap experience as other readers without re-rendering the canvas.

---

## EPUB Themes Are Per-Book

**Decision:** Each EPUB gets its own persisted theme, font, size, margin settings.

**Why:** Different books have different typographic needs. A technical book might need monospace font and wide margins, while a novel reads best in serif with narrow margins. Settings persist in localStorage keyed by file path.

---

## Readers Lazy-Loaded via React.lazy()

**Decision:** All readers are code-split and loaded on demand.

**Why:** epub.js (~200KB), pdf.js (~400KB), fflate, libarchive.js are all heavy. Loading them eagerly on the library page would destroy initial load performance.

---

## Vault Write-Back to `.reading/` Subdirectories

**Decision:** Reading state, bookmarks, annotations, and voice comments are saved inside the vault as `{file}.reading/` directories.

**Why:** Keeps data co-located with the content file in the Obsidian vault. If the user moves a book folder, the reading data moves with it. Also makes data visible and editable in Obsidian (annotations use callout syntax in `.md` files).

---

## No File Deletion or Movement

**Decision:** The app NEVER deletes or moves vault files. Only copies.

**Why:** The vault is the user's Obsidian library. Destructive operations risk data loss. The user manages file organization manually.

---

## Spanish UI Language

**Decision:** All user-facing text is in Spanish.

**Why:** The user is Spanish-speaking and explicitly specified this. No i18n system — strings are hardcoded in Spanish.

---

## Bun, Not Node.js

**Decision:** All commands use `bun run`, `bunx`, never `npm`/`npx`/`node`.

**Why:** User's project is configured for Bun. It's faster and the lockfile is `bun.lock`.

---

## PDF Fit-to-Width/Height Are One-Shot Actions

**Decision:** `applyFit('width')` and `applyFit('height')` compute the correct scale and call `setScale()` once. No persistent `fitMode` state, no highlighted/selected state on buttons.

**Why:** User explicitly said "al final es una simple accion de zoom en el momento, no un estado". An earlier attempt with `fitMode` as persistent state caused visual glitches: page not repainting, losing white background, ResizeObserver loops in scroll mode. The one-shot approach is simpler and glitch-free.

---

## PDF Region Annotations Work in Both Paged and Scroll

**Decision:** Annotate mode (region drag) works in both paged and scroll view modes.

**Why:** There was no technical reason to restrict it. Each `PdfScrollPage` gets its own crosshair overlay and drag handlers. The `RegionDrag` type has an optional `page` field to track which page the drag started on (needed in scroll where multiple pages are visible).

---

## Tauri v2 Replaces Capacitor

**Decision:** Migrated from Capacitor to Tauri v2 for all native platforms (Linux desktop, Android, future iOS).

**Why:** Tauri provides a single framework for web, desktop, and mobile instead of Capacitor's mobile-only focus. Benefits: smaller binary sizes (~7MB DEB vs Electron's ~150MB), Rust backend for performance, unified plugin system (fs, http, process). Capacitor was fully removed — all `@capacitor/*` deps, `android/` project, `capacitor.config.json`, and `capacitorFS.ts` deleted.

---

## AI CORS Strategy: Tauri HTTP + Dev Proxy

**Decision:** Three-tier approach for AI API calls:
1. **Tauri native**: `@tauri-apps/plugin-http` bypasses CORS entirely
2. **Web dev**: Bun proxy on `localhost:3001` forwards to LLM APIs
3. **Anthropic exception**: `anthropic-dangerous-direct-browser-access` header works without proxy

**Why:** Browser CORS blocks direct calls to OpenAI/GitHub/Ollama APIs. Tauri's native HTTP client has no CORS. For web development, a lightweight proxy is simpler than configuring each provider. Anthropic uniquely supports a browser opt-in header.

---

## AI Service Code-Split

**Decision:** `aiService.ts` is dynamically imported only in `ImportPage.tsx`, producing a ~5KB separate chunk.

**Why:** AI functionality is only used during import. Loading LLM client code on every page would waste bandwidth. Dynamic import keeps the main bundle lean.

---

## E-Ink Theme Is Visual-Only

**Decision:** The `.eink` CSS class applies B&W colors, removes animations/shadows/transitions, but does NOT disable gestures, zoom, or transforms.

**Why:** Target device is Boox Air 5C, which has a BSR processor that handles touch gestures and partial refresh natively. Disabling functional transforms would break the reading experience. Only decorative visual effects need removal for e-ink clarity.
