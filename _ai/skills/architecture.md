# LibReader — Architecture

## Directory Tree

```
src/
├── App.tsx                    # Root: ThemeProvider + BrowserRouter + Routes + Layout
├── main.tsx                   # React 19 createRoot mount
├── index.css                  # Tailwind v4 theme tokens (CSS custom properties, light/dark)
├── assets/
│   └── hero.png               # Welcome screen illustration
├── types/
│   ├── index.ts               # All TS types: LibraryItem, VaultFolder, FileFormat, etc.
│   └── annotation.ts          # Unified annotation types: Annotation, DocumentPosition, etc. (~128 lines)
├── store/
│   ├── libraryStore.ts        # Zustand store with persist middleware
│   └── __tests__/
│       └── libraryStore.test.ts   # 16 tests
├── services/
│   ├── vaultParser.ts         # FSAdapter interface, WebFSAdapter, IndexedDB, vault parsing
│   ├── comicParser.ts         # CBZ (fflate) + CBR (libarchive.js) extraction
│   ├── annotationService.ts   # Annotation CRUD, queries, linking, legacy migration (~355 lines)
│   ├── annotationWriter.ts    # Write reading state/bookmarks/annotations to vault (~226 lines)
│   ├── voiceRecorder.ts       # MediaRecorder voice comments, save/load in vault
│   ├── capacitorFS.ts         # CapacitorFSAdapter for native iOS/Android
│   └── __tests__/             # 136 tests across 5 files
├── hooks/
│   ├── useFileSystem.ts       # Singleton WebFSAdapter, auto-restore from IndexedDB
│   ├── useVaultLoader.ts      # Auto-loads vault when FS ready
│   ├── useFilteredItems.ts    # Memoized filter + sort + folder scoping
│   ├── useCoverUrl.ts         # Vault paths → blob URLs, CBZ cover extraction
│   └── __tests__/
│       └── useFilteredItems.test.ts  # 20 tests
├── pages/
│   ├── LibraryPage.tsx        # Main library grid/list, welcome screen when no vault
│   ├── BookDetailPage.tsx     # Item detail + lazy reader launch
│   ├── FolderPage.tsx         # Folder-specific item view
│   └── SettingsPage.tsx       # Vault, folders, theme config
├── components/
│   ├── layout/
│   │   └── Layout.tsx         # Sidebar + mobile header + nav links
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
│       ├── VideoReader.tsx  # YouTube video player with annotations (~726 lines)
│       ├── AnnotationPopup.tsx # Shared floating color picker (~78 lines)
│       ├── AnnotationsPanel.tsx # Shared sidebar: bookmarks + highlights + note editing (~352 lines)
│       ├── VoiceCommentsPanel.tsx  # Shared voice recording UI (~525 lines)
│       ├── tapZones.ts        # Shared tap zone layout config (~53 lines)
│       └── __tests__/
│           └── VoiceCommentsPanel.test.tsx  # 14 tests
└── test/
    └── setup.ts               # Vitest setup: jest-dom + localStorage mock
```

## Routing

| Route            | Component        | Description                          |
|------------------|------------------|--------------------------------------|
| `/`              | `LibraryPage`    | Library grid/list or welcome screen  |
| `/item/:id`      | `BookDetailPage` | Item detail + reader launch          |
| `/folder/:slug`  | `FolderPage`     | Folder-scoped item view              |
| `/settings`      | `SettingsPage`   | Vault, folders, theme                |

Wrapped in: `ThemeProvider > BrowserRouter > Layout > Routes`

## State Management (Zustand)

**Store:** `src/store/libraryStore.ts`

**Persisted** (localStorage key `libreader-storage`):
- `vaultConfig` — vault path + folder definitions
- `theme` — `'light' | 'dark' | 'system'`
- `viewMode` — `'grid' | 'list'`
- `sort` — `{ field, direction }`
- `progress` — `Record<id, ReadingProgress>`
- `annotations` — `Record<id, Annotation[]>`

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
| `@capacitor/core` + `@capacitor/filesystem` | Native filesystem |

## Vite Config

- **Plugins:** `@vitejs/plugin-react` + `@tailwindcss/vite`
- **Alias:** `@ → ./src`
- **optimizeDeps.exclude:** `['libarchive.js']` (WASM + Worker breaks pre-bundling)
- **public/:** `libarchive-worker.js`, `libarchive.wasm`

## Tests

263 unit tests across 10 files (Vitest), 15 E2E tests (Playwright).

```bash
bunx vitest run          # Unit tests
bunx playwright test     # E2E tests
```
