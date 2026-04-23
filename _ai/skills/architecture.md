# LibReader — Architecture

## Directory Tree

```
src/
├── App.tsx                    # Root: ThemeProvider + BrowserRouter + Routes + Layout
├── main.tsx                   # React 19 createRoot mount
├── index.css                  # Tailwind v4 theme tokens (light/dark/eink CSS custom properties)
├── assets/
│   └── hero.png               # Welcome screen illustration
├── types/
│   ├── index.ts               # All TS types: LibraryItem, VaultFolder, FileFormat, etc.
│   └── annotation.ts          # Unified annotation types: Annotation, DocumentPosition, etc. (~128 lines)
├── store/
│   ├── libraryStore.ts        # Zustand store with persist middleware (includes AIProviderConfig)
│   └── __tests__/
│       └── libraryStore.test.ts   # 16 tests
├── services/
│   ├── vaultParser.ts         # FSAdapter interface, WebFSAdapter, IndexedDB, vault parsing
│   ├── comicParser.ts         # CBZ (fflate) + CBR (libarchive.js) extraction
│   ├── importService.ts       # Import wizard: metadata extraction, .md generation (includes summary)
│   ├── aiService.ts           # Multi-provider LLM abstraction (~230 lines, code-split)
│   ├── annotationService.ts   # Annotation CRUD, queries, linking, legacy migration (~355 lines)
│   ├── annotationWriter.ts    # Write reading state/bookmarks/annotations to vault (~226 lines)
│   ├── voiceRecorder.ts       # MediaRecorder voice comments, save/load in vault
│   ├── tauriFS.ts             # TauriFSAdapter for native desktop/mobile via Tauri (~195 lines)
│   └── __tests__/             # 136 tests across 5 files
├── hooks/
│   ├── useFileSystem.ts       # Platform detection (isTauriNative), adapter switching (Web/Tauri)
│   ├── useBackButton.ts       # Escape keydown handler (Tauri process exit on root)
│   ├── useVaultLoader.ts      # Auto-loads vault when FS ready
│   ├── useFilteredItems.ts    # Memoized filter + sort + folder scoping
│   ├── useCoverUrl.ts         # Vault paths → blob URLs, CBZ cover extraction
│   └── __tests__/
│       └── useFilteredItems.test.ts  # 20 tests
├── pages/
│   ├── LibraryPage.tsx        # Main library grid/list, welcome screen when no vault
│   ├── BookDetailPage.tsx     # Item detail + lazy reader launch
│   ├── FolderPage.tsx         # Folder-specific item view
│   ├── ImportPage.tsx         # Import wizard with AI enrichment buttons
│   ├── StatsPage.tsx          # Reading statistics
│   └── SettingsPage.tsx       # Vault, folders, theme, AI provider config
├── components/
│   ├── layout/
│   │   └── Layout.tsx         # Sidebar + mobile header + nav links + theme toggle (4 themes)
│   ├── library/
│   │   ├── BookCard.tsx       # Grid/list card with cover
│   │   ├── FilterBar.tsx      # Search, sort, filter chips
│   │   └── __tests__/         # 27 tests
│   └── reader/
│       ├── ComicReader.tsx    # CBZ/CBR reader (~1498 lines)
│       ├── comicUtils.ts      # getImageContentRect(), findImgElement() (~49 lines)
│       ├── ComicScrollUnits.tsx # ScrollUnitV, ScrollUnitH with region overlays (~208 lines)
│       ├── ComicIcons.tsx     # 6 SVG icon components (~56 lines)
│       ├── PdfReader.tsx      # PDF reader (~1609 lines)
│       ├── EpubReader.tsx     # EPUB reader (~1167 lines)
│       ├── MarkdownViewer.tsx # Markdown reader with annotations (~502 lines)
│       ├── VideoReader.tsx    # YouTube video player with annotations (~726 lines)
│       ├── AnnotationPopup.tsx # Shared floating color picker (~78 lines)
│       ├── AnnotationsPanel.tsx # Shared sidebar: bookmarks + highlights + note editing (~352 lines)
│       ├── VoiceCommentsPanel.tsx  # Shared voice recording UI (~525 lines)
│       ├── tapZones.ts        # Shared tap zone layout config (~53 lines)
│       └── __tests__/
│           └── VoiceCommentsPanel.test.tsx  # 14 tests
└── test/
    └── setup.ts               # Vitest setup: jest-dom + localStorage mock

src-tauri/                     # Tauri v2 backend
├── Cargo.toml                 # Rust deps: tauri + plugins (fs, http, process, log)
├── src/
│   ├── lib.rs                 # Plugin registration
│   └── main.rs                # Entry point
├── tauri.conf.json            # App config (identifier: com.libreader.app)
├── capabilities/
│   └── default.json           # FS/HTTP/process permissions
└── gen/
    └── android/               # Generated Android project

scripts/
├── check.sh                   # Runs typecheck + tests + build
├── dev.sh                     # Starts dev server
└── proxy.ts                   # CORS proxy for AI APIs (Bun server on :3001)
```

## Routing

| Route            | Component        | Description                          |
|------------------|------------------|--------------------------------------|
| `/`              | `LibraryPage`    | Library grid/list or welcome screen  |
| `/item/:id`      | `BookDetailPage` | Item detail + reader launch          |
| `/folder/:slug`  | `FolderPage`     | Folder-scoped item view              |
| `/import`        | `ImportPage`     | Import wizard with AI enrichment     |
| `/stats`         | `StatsPage`      | Reading statistics                   |
| `/settings`      | `SettingsPage`   | Vault, folders, theme, AI config     |

Wrapped in: `ThemeProvider > BrowserRouter > Layout > Routes`

## State Management (Zustand)

**Store:** `src/store/libraryStore.ts`

**Persisted** (localStorage key `libreader-storage`):
- `vaultConfig` — vault path + folder definitions
- `theme` — `'light' | 'dark' | 'eink' | 'system'`
- `viewMode` — `'grid' | 'list'`
- `sort` — `{ field, direction }`
- `progress` — `Record<id, ReadingProgress>`
- `annotations` — `Record<id, Annotation[]>`
- `aiProvider` — `AIProviderConfig` (provider, apiKey, model, baseUrl)

**Ephemeral** (re-parsed each session):
- `items` — `LibraryItem[]`
- `filter` — active filters
- `isLoading`, `error`

## Vault Parser Flow

```
parseVault(fs, config)
  ├─ buildImageIndex(fs, folderPaths) → Map<filename, path>
  └─ For each folder:
       └─ parseFlatDir(fs, folder)
            └─ For each subdirectory:
                 └─ parseBookDir(fs, dir, imageIndex)
                      ├─ Find .md file
                      ├─ parseFrontmatter(content)  # custom, uses `yaml` pkg
                      ├─ Resolve cover (4-level fallback)
                      ├─ Detect formats from file extensions
                      ├─ Parse authors (wikilink extraction)
                      ├─ Read .reading/state.json for progress
                      └─ Return LibraryItem
```

## Reader Loading (Code Splitting)

All readers are lazy-loaded via `React.lazy()` in `BookDetailPage.tsx`:

```typescript
const EpubReader  = lazy(() => import('@/components/reader/EpubReader')...);
const PdfReader   = lazy(() => import('@/components/reader/PdfReader')...);
const ComicReader = lazy(() => import('@/components/reader/ComicReader')...);
const VideoReader = lazy(() => import('@/components/reader/VideoReader')...);
```

Heavy dependencies only download when the user opens that format.

## AI Service (Code Splitting)

`aiService.ts` is dynamically imported in `ImportPage.tsx` (~5KB chunk). Provides:
- `enrichMetadata(metadata, config)` — fills missing fields from LLM
- `suggestTags(metadata, config)` — returns hierarchical `#`-prefixed tags
- `generateSummary(metadata, config)` — returns Spanish summary paragraph

Uses Tauri HTTP plugin on native (bypasses CORS), fetch on web (via proxy or direct).

## Data Persistence Layers

| Key Pattern | Storage | Data |
|-------------|---------|------|
| `libreader-storage` | localStorage | Zustand state |
| `libreader:annotations:{filePath}` | localStorage | Unified annotations (all formats) |
| `libreader:{filePath}:{key}` | localStorage | EPUB reader (position, bookmarks, highlights, settings) — legacy |
| `libreader:pdf:{filePath}:{key}` | localStorage | PDF reader (page, layout, scale) — legacy |
| `libreader:comic:{filePath}:{key}` | localStorage | Comic reader (page, layout, direction) |
| `libreader:video:{filePath}:position` | localStorage | Video reader (playback position in seconds) |
| `libreader-fs` / IndexedDB | IndexedDB | FileSystemDirectoryHandle (vault reconnect) |
| `{item}/.reading/` | Vault filesystem | state.json, bookmarks.json, annotations.md, voice/ |

## Vault Write-Back Structure

```
ItemFolder/
  └── ItemFile.epub.reading/
       ├── state.json           # Position, progress, settings
       ├── bookmarks.json       # Bookmarks with CFI/page
       ├── annotations.md       # Obsidian-compatible highlights (callout syntax)
       └── voice/
            ├── voice-comments.json
            └── {id}.webm.b64   # Audio as base64
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `epubjs` | EPUB rendering (iframe-based) |
| `pdfjs-dist` | PDF rendering (canvas-based) |
| `fflate` | CBZ extraction (sync unzipSync) |
| `libarchive.js` | CBR extraction (WASM, dynamic import only) |
| `yaml` | Frontmatter parsing (browser-safe, replaces gray-matter) |
| `react-markdown` + `remark-gfm` | .md note rendering |
| `@tauri-apps/api` | Tauri core JS API |
| `@tauri-apps/plugin-fs` | Native filesystem access |
| `@tauri-apps/plugin-http` | Native HTTP (CORS-free) |
| `@tauri-apps/plugin-process` | App exit/restart |
| `@tauri-apps/plugin-log` | Logging |

## Tauri Config

- **Identifier:** `com.libreader.app`
- **Frontend dist:** `../dist` (Vite output)
- **Plugins:** fs, http, process, log
- **Capabilities:** FS read/write, HTTP fetch, process exit
- **Targets:** Web (dev server), Linux (DEB/RPM), Android (APK/AAB), future iOS

## Vite Config

- **Plugins:** `@vitejs/plugin-react` + `@tailwindcss/vite`
- **Alias:** `@ → ./src`
- **optimizeDeps.exclude:** `['libarchive.js']` (WASM + Worker breaks pre-bundling)
- **public/:** `libarchive-worker.js`, `libarchive.wasm`

## Tests

429 unit tests across 20 files (Vitest), 15 E2E tests (Playwright).

```bash
bunx vitest run          # Unit tests
bunx playwright test     # E2E tests
```
