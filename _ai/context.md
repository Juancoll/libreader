# LibReader — Project Context

## What is LibReader

Multiplatform ebook reader application that reads from an Obsidian vault.

- Reads books (EPUB, PDF), comics (CBZ, CBR), and author metadata from a local vault
- Web-first, then mobile/desktop via Capacitor
- UI language: Spanish

## Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Framework     | React + TypeScript                |
| Build         | Vite                              |
| Runtime       | **Bun** (NOT Node.js)             |
| CSS           | Tailwind CSS v4                   |
| State         | Zustand (with persist middleware) |
| Routing       | React Router                      |
| Native        | Capacitor                         |
| PDF           | pdfjs-dist                        |
| EPUB          | epubjs                            |
| CBZ           | fflate (synchronous unzipSync)    |
| CBR           | libarchive.js@2.0.2 (WASM, dynamic import only) |
| Tests         | Vitest (unit), Playwright (e2e)   |

## Commands

```bash
bun run dev --host      # Dev server on port 5173
bun run build           # Production build (tsc -b && vite build)
bunx vitest run         # Unit tests (191 tests, 9 files)
bunx playwright test    # E2E tests
bunx tsc --noEmit       # Type check only
```

## Vault Location & Rules

Vault path: `~/OneDrive/resources/library`

### Vault structure

```
library/
  books/      # 14 book folders (epub/pdf + md + cover image)
  comics/     # 56+ comic folders (cbz/cbr + md + cover image)
  authors/    # 27 author folders (md + optional photo)
  papers/     # EMPTY
  courses/    # EMPTY
  others/polymatas/   # NOT part of the library, excluded
```

### Each item folder

```
Item Name/
  Item Name.md        # Metadata (frontmatter YAML)
  Item Name.jpg       # Cover (same base name as .md)
  Item Name.epub      # Content file (or .pdf, .cbz, .cbr)
```

### Critical vault rules

1. **NEVER delete or move files** — always COPY; user deletes manually
2. Cover/photo filename = same base name as the `.md` file
3. Comic naming convention: `Series - T## - Title`
4. Authors referenced as wikilinks: `"[[Author Name]]"`

### VaultFolder interface

```typescript
{ name: string; path: string; showInMenu: boolean; showInLibrary: boolean }
```

Nothing else. No hardcoded categories. Generic/minimal design. Content type is derived from file extensions (epub, pdf, cbz, cbr, md), not from folder-level configuration.

## Key Constraints

- **No ContentType enum** — fully eliminated; file extensions determine behavior
- **No fit mode selector** in comic reader — images always `object-fit: contain`
- **Ctrl+wheel = browser zoom** — never intercepted by the app
- **Readers should "just work"** — user doesn't want to revisit reader code
- **libarchive.js must be dynamically imported** — static import crashes Vite with "Outdated Optimize Dep" 504 error
- Vite config has `optimizeDeps: { exclude: ['libarchive.js'] }`
- Two files served from `public/`: `libarchive-worker.js` and `libarchive.wasm`
- `gray-matter` replaced with custom `parseFrontmatter()` using `yaml` npm package
