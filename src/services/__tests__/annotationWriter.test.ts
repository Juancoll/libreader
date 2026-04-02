/**
 * Tests for annotationWriter service.
 * Tests writing reading state, bookmarks, and annotations to the vault.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getReadingDirPath,
  writeReadingState,
  writeBookmarks,
  writeAnnotations,
  writeAllReadingData,
  type ReadingState,
  type BookmarkEntry,
  type HighlightEntry,
} from '@/services/annotationWriter';
import type { FSAdapter } from '@/services/vaultParser';

// ---- Mock FSAdapter ----

function createMockFS(): FSAdapter & {
  writtenFiles: Map<string, string>;
  createdDirs: Set<string>;
} {
  const writtenFiles = new Map<string, string>();
  const createdDirs = new Set<string>();

  return {
    writtenFiles,
    createdDirs,
    readDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    readBinaryFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
      writtenFiles.set(path, content);
    }),
    mkdir: vi.fn().mockImplementation(async (path: string) => {
      createdDirs.add(path);
    }),
    exists: vi.fn().mockResolvedValue(false),
    getFileUrl: vi.fn().mockResolvedValue('blob:test'),
  };
}

// ---- Test data ----

const sampleState: ReadingState = {
  file: 'MyBook.epub',
  format: 'epub',
  currentPage: 42,
  totalPages: 300,
  progress: 0.14,
  lastRead: '2025-06-15T10:30:00.000Z',
  epubCfi: 'epubcfi(/6/14!/4/2/1:0)',
  pageLayout: 'single',
  readingDirection: 'ltr',
};

const sampleBookmarks: BookmarkEntry[] = [
  {
    id: 'bm-1',
    cfi: 'epubcfi(/6/10!/4/2/1:0)',
    chapter: 'Capítulo 1',
    percentage: 5,
    createdAt: '2025-06-14T08:00:00.000Z',
  },
  {
    id: 'bm-2',
    cfi: 'epubcfi(/6/30!/4/2/1:0)',
    page: 42,
    chapter: 'Capítulo 3',
    percentage: 14,
    createdAt: '2025-06-15T10:30:00.000Z',
  },
];

const sampleHighlights: HighlightEntry[] = [
  {
    id: 'hl-1',
    cfiRange: 'epubcfi(/6/14!/4/2,/1:0,/1:50)',
    text: 'Este es un texto destacado',
    color: 'yellow',
    note: 'Nota importante',
    chapter: 'Capítulo 2',
    createdAt: '2025-06-14T12:00:00.000Z',
  },
  {
    id: 'hl-2',
    cfiRange: 'epubcfi(/6/14!/4/4,/1:0,/1:30)',
    text: 'Otro fragmento resaltado',
    color: 'blue',
    note: '',
    chapter: 'Capítulo 2',
    createdAt: '2025-06-14T12:05:00.000Z',
  },
  {
    id: 'hl-3',
    cfiRange: 'epubcfi(/6/30!/4/2,/1:10,/1:80)',
    text: 'Highlight en otro capítulo',
    color: 'green',
    note: '',
    chapter: 'Capítulo 3',
    createdAt: '2025-06-15T10:00:00.000Z',
  },
];

// ---- Tests ----

describe('annotationWriter', () => {
  let fs: ReturnType<typeof createMockFS>;

  beforeEach(() => {
    fs = createMockFS();
  });

  describe('getReadingDirPath', () => {
    it('appends .reading to a file path', () => {
      expect(getReadingDirPath('books/MyBook/MyBook.epub')).toBe(
        'books/MyBook/MyBook.epub.reading'
      );
    });

    it('handles paths without directories', () => {
      expect(getReadingDirPath('file.pdf')).toBe('file.pdf.reading');
    });

    it('handles comic archive paths', () => {
      expect(getReadingDirPath('comics/Series/Issue.cbz')).toBe(
        'comics/Series/Issue.cbz.reading'
      );
    });
  });

  describe('writeReadingState', () => {
    it('creates the .reading directory', async () => {
      await writeReadingState(fs, 'books/MyBook/MyBook.epub', sampleState);
      expect(fs.createdDirs.has('books/MyBook/MyBook.epub.reading')).toBe(true);
    });

    it('writes state.json with correct content', async () => {
      await writeReadingState(fs, 'books/MyBook/MyBook.epub', sampleState);
      const written = fs.writtenFiles.get('books/MyBook/MyBook.epub.reading/state.json');
      expect(written).toBeDefined();
      const parsed = JSON.parse(written!);
      expect(parsed.file).toBe('MyBook.epub');
      expect(parsed.format).toBe('epub');
      expect(parsed.currentPage).toBe(42);
      expect(parsed.totalPages).toBe(300);
      expect(parsed.progress).toBe(0.14);
      expect(parsed.epubCfi).toBe('epubcfi(/6/14!/4/2/1:0)');
      expect(parsed.pageLayout).toBe('single');
    });

    it('writes valid JSON with indentation', async () => {
      await writeReadingState(fs, 'test.epub', sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/state.json')!;
      // Should be formatted with 2-space indent
      expect(content).toContain('\n  ');
    });
  });

  describe('writeBookmarks', () => {
    it('creates the .reading directory', async () => {
      await writeBookmarks(fs, 'books/MyBook/MyBook.epub', sampleBookmarks);
      expect(fs.createdDirs.has('books/MyBook/MyBook.epub.reading')).toBe(true);
    });

    it('writes bookmarks.json with correct structure', async () => {
      await writeBookmarks(fs, 'books/MyBook/MyBook.epub', sampleBookmarks);
      const written = fs.writtenFiles.get('books/MyBook/MyBook.epub.reading/bookmarks.json');
      expect(written).toBeDefined();
      const parsed = JSON.parse(written!);
      expect(parsed.file).toBe('MyBook.epub');
      expect(parsed.bookmarks).toHaveLength(2);
    });

    it('preserves bookmark fields correctly', async () => {
      await writeBookmarks(fs, 'test.epub', sampleBookmarks);
      const parsed = JSON.parse(fs.writtenFiles.get('test.epub.reading/bookmarks.json')!);
      const bm = parsed.bookmarks[0];
      expect(bm.id).toBe('bm-1');
      expect(bm.cfi).toBe('epubcfi(/6/10!/4/2/1:0)');
      expect(bm.chapter).toBe('Capítulo 1');
      expect(bm.percentage).toBe(5);
    });

    it('writes empty bookmarks array when none provided', async () => {
      await writeBookmarks(fs, 'test.epub', []);
      const parsed = JSON.parse(fs.writtenFiles.get('test.epub.reading/bookmarks.json')!);
      expect(parsed.bookmarks).toEqual([]);
    });

    it('extracts filename from path for the file field', async () => {
      await writeBookmarks(fs, 'books/deep/nested/Book.pdf', []);
      const parsed = JSON.parse(fs.writtenFiles.get('books/deep/nested/Book.pdf.reading/bookmarks.json')!);
      expect(parsed.file).toBe('Book.pdf');
    });
  });

  describe('writeAnnotations', () => {
    it('creates the .reading directory', async () => {
      await writeAnnotations(fs, 'test.epub', [], sampleState);
      expect(fs.createdDirs.has('test.epub.reading')).toBe(true);
    });

    it('writes annotations.md with YAML frontmatter', async () => {
      await writeAnnotations(fs, 'test.epub', [], sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('file: test.epub');
      expect(content).toContain('format: epub');
      expect(content).toContain('totalPages: 300');
      expect(content).toContain('progress: 14%');
    });

    it('includes progress section in the body', async () => {
      await writeAnnotations(fs, 'test.epub', [], sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toContain('## Progress');
      expect(content).toContain('**Current page**: 42 / 300');
      expect(content).toContain('**Progress**: 14%');
    });

    it('formats highlights as Obsidian quote callouts', async () => {
      await writeAnnotations(fs, 'test.epub', sampleHighlights, sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toContain('> [!quote] yellow');
      expect(content).toContain('> Este es un texto destacado');
      expect(content).toContain('**Nota**: Nota importante');
    });

    it('groups highlights by chapter', async () => {
      await writeAnnotations(fs, 'test.epub', sampleHighlights, sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toContain('### Capítulo 2');
      expect(content).toContain('### Capítulo 3');
    });

    it('includes CFI ranges for highlights', async () => {
      await writeAnnotations(fs, 'test.epub', [sampleHighlights[0]], sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toContain('`epubcfi(/6/14!/4/2,/1:0,/1:50)`');
    });

    it('includes creation dates for highlights', async () => {
      await writeAnnotations(fs, 'test.epub', [sampleHighlights[0]], sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toContain('*2025-06-14*');
    });

    it('handles highlights without notes', async () => {
      await writeAnnotations(fs, 'test.epub', [sampleHighlights[1]], sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).not.toContain('**Nota**');
    });

    it('handles no state provided (defaults)', async () => {
      await writeAnnotations(fs, 'test.epub', []);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).toContain('format: epub');
      expect(content).toContain('progress: 0%');
    });

    it('detects format from file path when no state', async () => {
      await writeAnnotations(fs, 'comic.cbz', []);
      const content = fs.writtenFiles.get('comic.cbz.reading/annotations.md')!;
      expect(content).toContain('format: cbz');
    });

    it('does not add Highlights section when empty', async () => {
      await writeAnnotations(fs, 'test.epub', [], sampleState);
      const content = fs.writtenFiles.get('test.epub.reading/annotations.md')!;
      expect(content).not.toContain('## Highlights');
    });
  });

  describe('writeAllReadingData', () => {
    it('writes state, bookmarks, and annotations concurrently', async () => {
      await writeAllReadingData(fs, 'test.epub', {
        state: sampleState,
        bookmarks: sampleBookmarks,
        highlights: sampleHighlights,
      });

      expect(fs.writtenFiles.has('test.epub.reading/state.json')).toBe(true);
      expect(fs.writtenFiles.has('test.epub.reading/bookmarks.json')).toBe(true);
      expect(fs.writtenFiles.has('test.epub.reading/annotations.md')).toBe(true);
    });

    it('calls mkdir for the .reading directory', async () => {
      await writeAllReadingData(fs, 'test.epub', {
        state: sampleState,
        bookmarks: [],
        highlights: [],
      });
      // mkdir is called by each sub-function
      expect(fs.mkdir).toHaveBeenCalled();
    });
  });
});
