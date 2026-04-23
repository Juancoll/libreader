# LibReader

Lector multiplataforma de ebooks que lee desde un vault de Obsidian.

Soporta EPUB, PDF, CBZ, CBR, Markdown, y videos (YouTube). Funciona en web, Linux desktop y Android.

## Stack

| Capa | Tecnologia |
|------|------------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Runtime | Bun |
| CSS | Tailwind CSS v4 |
| Estado | Zustand (persist) |
| Routing | React Router |
| Nativo | Tauri v2 (desktop + Android) |
| PDF | pdfjs-dist |
| EPUB | epubjs |
| CBZ | fflate |
| CBR | libarchive.js (WASM) |
| AI | Multi-provider (OpenAI, Anthropic, GitHub Models, Ollama) |
| Tests | Vitest + Playwright |

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- [Rust](https://rustup.rs) >= 1.77 (para builds nativos)
- Android SDK + NDK 27 (para Android)
- Xcode (para iOS, solo en macOS)

## Desarrollo

```bash
bun install                # Instalar dependencias
bun run dev                # Dev server en http://localhost:5173
bun run proxy              # CORS proxy para AI APIs (solo dev web)
bun run tauri:dev          # Dev con Tauri (desktop nativo + hot reload)
```

## Build

```bash
bun run build              # Build web (dist/)
bun run tauri:build        # Linux desktop (deb + rpm)
bun run tauri:android:build # Android APK + AAB
```

## Tests

```bash
bun run test               # 429 unit tests (Vitest)
bun run test:e2e           # 15 E2E tests (Playwright)
bun run typecheck          # Type check (tsc --noEmit)
```

## Estructura del proyecto

```
src/
  App.tsx              # Root: ThemeProvider + Router + Layout
  index.css            # Tailwind v4 theme tokens (light/dark/eink)
  store/               # Zustand store (libraryStore.ts)
  services/
    vaultParser.ts     # FSAdapter, WebFSAdapter, vault parsing
    tauriFS.ts         # TauriFSAdapter (Tauri nativo)
    aiService.ts       # AI multi-provider abstraction
    importService.ts   # Import wizard service
    comicParser.ts     # CBZ/CBR extraction
    annotationService.ts
    annotationWriter.ts
    voiceRecorder.ts
  hooks/
    useFileSystem.ts   # Singleton FS adapter (Web o Tauri)
    useVaultLoader.ts
    useFilteredItems.ts
    useCoverUrl.ts
  pages/
    LibraryPage.tsx    # Biblioteca grid/list
    BookDetailPage.tsx # Detalle + lanzar reader
    ImportPage.tsx     # Wizard de importacion (7 pasos + AI)
    SettingsPage.tsx   # Config: vault, carpetas, tema, AI provider
    StatsPage.tsx      # Estadisticas de lectura
  components/
    layout/Layout.tsx  # Sidebar + header mobile
    library/           # BookCard, FilterBar
    reader/            # 5 readers + componentes compartidos
src-tauri/             # Tauri (Rust backend)
scripts/
  proxy.ts             # CORS proxy para dev web
  check.sh             # typecheck + tests + build
_ai/                   # Documentacion para agentes AI
```

## Readers

| Formato | Reader | Dependencia |
|---------|--------|-------------|
| EPUB | EpubReader | epubjs |
| PDF | PdfReader | pdfjs-dist |
| CBZ | ComicReader | fflate |
| CBR | ComicReader | libarchive.js |
| Markdown | MarkdownViewer | react-markdown |
| YouTube | VideoReader | YouTube IFrame API |

Todos los readers comparten: sistema de gestos (tap zones, pinch-to-zoom, swipe), anotaciones (highlights, regiones, bookmarks), comentarios de voz, y persistencia en vault.

## AI

Soporte multi-provider para enriquecer importaciones:

- **Completar metadatos**: buscar info del libro, sugerir titulo/autor/editorial
- **Sugerir tags**: basado en contenido y tags existentes en el vault
- **Generar resumen**: resumen breve en espanol

Providers soportados:
- OpenAI (gpt-4o-mini)
- Anthropic (claude-sonnet)
- GitHub Models
- Ollama (local)

Configuracion en Ajustes > Inteligencia Artificial.

## Temas

- **Claro** / **Oscuro** / **Sistema** / **E-Ink**
- E-Ink: B&W puro, sin animaciones, sin sombras. Optimizado para Boox.

## Vault de Obsidian

La app lee y escribe en un vault local:

```
library/
  books/           # EPUB, PDF
  comics/          # CBZ, CBR
  authors/         # Metadatos de autores
  papers/
  courses/
  movies/          # Videos YouTube
  others/
```

Cada item es una carpeta con:
- `Item.md` — frontmatter YAML con metadatos
- `Item.epub` (o .pdf, .cbz, .cbr) — contenido
- `Item.jpg` — portada (mismo nombre base que .md)
- `Item.epub.reading/` — estado de lectura, anotaciones, voz

**Regla critica**: la app NUNCA elimina ni mueve archivos del vault.

## CI/CD

GitHub Actions compila para todas las plataformas:
- **Web**: build + tests en cada push
- **Linux**: deb + rpm via Tauri
- **Android**: APK via Tauri
- **iOS**: IPA via Tauri (runner macOS)

## Licencia

Proyecto privado.
