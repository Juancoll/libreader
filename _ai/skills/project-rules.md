# LibReader — Project Rules (AI System Prompt)

You are working on **LibReader**, a multiplatform ebook reader built with React + TypeScript.

## Before you start

1. Read `_ai/context.md` for project overview, stack, and vault rules.
2. Read `_ai/skills/architecture.md` for code structure and key files.
3. Read `_ai/skills/readers.md` for reader implementation details.
4. Read `_ai/skills/annotations.md` for annotation system, storage formats, and voice comments.
5. Read `_ai/skills/decisions.md` for past design decisions and rationale.
6. Read `_ai/skills/status.md` for current state and next steps.

## Hard rules

- **Runtime is Bun**, not Node.js. Use `bun run`, `bunx`, never `npm`/`npx`.
- **UI language is Spanish.** All user-facing text in Spanish.
- **Never delete or move vault files.** Only copy. User deletes manually.
- **No hardcoded categories.** Content type comes from file extensions, not folder config.
- **No ContentType enum.** It was fully eliminated.
- **No fit mode selector** in comic reader. Images always `object-fit: contain`.
- **Ctrl+wheel is browser zoom.** Never intercept it for app zoom.
- **libarchive.js must be dynamically imported** (`await import('libarchive.js')`). Static import crashes Vite.
- **Position preservation is mandatory.** When switching view modes, all readers must stay at the current reading position.
- **Readers must behave consistently.** Same gesture system, same tap zones, same UI auto-hide across Comic, PDF, and EPUB.

## Code style

- Prefer editing existing files over creating new ones.
- Keep components in their existing files unless they exceed ~1500 lines.
- Use path aliases (`@/services/...`, `@/components/...`).
- No emojis in code or comments unless explicitly requested.

## Verification checklist

After any change, run (or use `scripts/check.sh`):

```bash
bunx tsc --noEmit        # Must pass with zero new errors
bunx vitest run           # 429+ tests must pass
bun run build             # Production build must succeed
```

Pre-existing type errors in `vaultParser.ts` and `comicParser.ts` are known and acceptable for now.
