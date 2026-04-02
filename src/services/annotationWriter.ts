/**
 * Annotation Writer Service
 * Writes annotations, bookmarks, and reading state back to the vault
 * in Obsidian-compatible format (.reading/ directories).
 *
 * Format matches the Obsidian ePub Reader plugin:
 * - state.json: reading position, progress, settings
 * - bookmarks.json: list of bookmarks with CFI/page positions
 * - annotations.md: frontmatter + markdown-formatted highlights
 */

import type { FSAdapter } from './vaultParser';

// ---- Types ----

export interface ReadingState {
  file: string;
  format: 'epub' | 'pdf' | 'cbz' | 'cbr' | 'md' | 'youtube';
  currentPage: number;
  totalPages: number;
  progress: number; // 0-1
  lastRead: string; // ISO date
  epubCfi?: string;
  pageLayout?: string;
  navMode?: string;
  readingDirection?: 'ltr' | 'rtl';
  zoom?: { level: number; mode: string };
  /** Video: current playback position in seconds */
  currentTime?: number;
  /** Video: total duration in seconds */
  duration?: number;
}

export interface BookmarkEntry {
  id: string;
  cfi?: string;
  page?: number;
  /** Video: timestamp in seconds */
  timestamp?: number;
  chapter: string;
  percentage: number;
  createdAt: string;
}

export interface HighlightEntry {
  id: string;
  cfiRange?: string;
  page?: number;
  text: string;
  color: string;
  note: string;
  chapter?: string;
  createdAt: string;
}

// ---- Helpers ----

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().split('T')[0];
  } catch {
    return iso;
  }
}

function escapeYaml(str: string): string {
  if (/[:#\[\]{}&*!|>'"@`,%]/.test(str) || str.includes('\n')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

// ---- Main functions ----

/**
 * Get the .reading directory path for a given file.
 * Example: "books/MyBook/MyBook.epub" -> "books/MyBook/MyBook.epub.reading"
 */
export function getReadingDirPath(filePath: string): string {
  return `${filePath}.reading`;
}

/**
 * Write reading state (position, progress) to the vault.
 */
export async function writeReadingState(
  fs: FSAdapter,
  filePath: string,
  state: ReadingState
): Promise<void> {
  const dir = getReadingDirPath(filePath);
  await fs.mkdir(dir);

  const json = JSON.stringify(state, null, 2);
  await fs.writeFile(`${dir}/state.json`, json);
}

/**
 * Write bookmarks to the vault.
 */
export async function writeBookmarks(
  fs: FSAdapter,
  filePath: string,
  bookmarks: BookmarkEntry[]
): Promise<void> {
  const dir = getReadingDirPath(filePath);
  await fs.mkdir(dir);

  const fileName = filePath.split('/').pop() || filePath;
  const json = JSON.stringify(
    {
      file: fileName,
      bookmarks: bookmarks.map((bm) => ({
        id: bm.id,
        cfi: bm.cfi,
        page: bm.page,
        timestamp: bm.timestamp,
        chapter: bm.chapter,
        percentage: bm.percentage,
        createdAt: bm.createdAt,
      })),
    },
    null,
    2
  );

  await fs.writeFile(`${dir}/bookmarks.json`, json);
}

/**
 * Write annotations (highlights + notes) to the vault as Obsidian-compatible markdown.
 */
export async function writeAnnotations(
  fs: FSAdapter,
  filePath: string,
  highlights: HighlightEntry[],
  state?: ReadingState
): Promise<void> {
  const dir = getReadingDirPath(filePath);
  await fs.mkdir(dir);

  const fileName = filePath.split('/').pop() || filePath;
  const progress = state ? Math.round(state.progress * 100) : 0;
  const lastRead = state?.lastRead || new Date().toISOString();

  // Build frontmatter
  const frontmatter = [
    '---',
    `file: ${escapeYaml(fileName)}`,
    `format: ${state?.format || detectFormatFromPath(filePath)}`,
    `totalPages: ${state?.totalPages || 0}`,
    `progress: ${progress}%`,
    `lastRead: ${lastRead}`,
    'tags:',
    '  - reading',
    `  - ${state?.format || detectFormatFromPath(filePath)}`,
    '---',
  ].join('\n');

  // Build markdown body
  const body: string[] = [];
  body.push(`# ${fileName}`);
  body.push('');
  body.push('## Progress');
  body.push('');
  body.push(`- **Current page**: ${state?.currentPage || 0} / ${state?.totalPages || 0}`);
  body.push(`- **Progress**: ${progress}%`);
  body.push(`- **Last read**: ${formatDate(lastRead)}`);
  body.push('');

  if (highlights.length > 0) {
    body.push('## Highlights');
    body.push('');

    // Group by chapter if available
    const byChapter = new Map<string, HighlightEntry[]>();
    for (const hl of highlights) {
      const chapter = hl.chapter || 'Sin capitulo';
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter)!.push(hl);
    }

    for (const [chapter, chapterHighlights] of byChapter) {
      if (byChapter.size > 1) {
        body.push(`### ${chapter}`);
        body.push('');
      }

      for (const hl of chapterHighlights) {
        body.push(`> [!quote] ${hl.color}`);
        body.push(`> ${hl.text.replace(/\n/g, '\n> ')}`);
        if (hl.note) {
          body.push('');
          body.push(`**Nota**: ${hl.note}`);
        }
        body.push('');
        body.push(`*${formatDate(hl.createdAt)}*`);
        if (hl.cfiRange) {
          body.push(`\`${hl.cfiRange}\``);
        }
        body.push('');
      }
    }
  }

  const content = frontmatter + '\n\n' + body.join('\n');
  await fs.writeFile(`${dir}/annotations.md`, content);
}

/**
 * Write all reading data (state + bookmarks + annotations) in one call.
 * Uses Promise.allSettled to avoid partial failures leaving inconsistent state.
 */
export async function writeAllReadingData(
  fs: FSAdapter,
  filePath: string,
  data: {
    state: ReadingState;
    bookmarks: BookmarkEntry[];
    highlights: HighlightEntry[];
  }
): Promise<void> {
  const results = await Promise.allSettled([
    writeReadingState(fs, filePath, data.state),
    writeBookmarks(fs, filePath, data.bookmarks),
    writeAnnotations(fs, filePath, data.highlights, data.state),
  ]);

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    const reasons = failures.map((r) => (r as PromiseRejectedResult).reason);
    console.warn(`writeAllReadingData: ${failures.length}/3 writes failed for ${filePath}`, reasons);
  }
}

function detectFormatFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (['epub', 'pdf', 'cbz', 'cbr', 'md', 'youtube'].includes(ext)) return ext;
  return 'unknown';
}
