/**
 * Tests for the useAnnotations hook.
 *
 * Validates bookmark CRUD, highlight CRUD, toggle behavior,
 * voice linking, note editing, and auto-persistence to localStorage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotations } from '../useAnnotations';
import type { Annotation, DocumentPosition } from '@/types/annotation';

const TEST_FILE = 'test/book.epub';

beforeEach(() => {
  localStorage.clear();
});

// ---- Helper to seed localStorage with existing annotations ----
function seedAnnotations(filePath: string, annotations: Annotation[]) {
  localStorage.setItem(
    `libreader:annotations:${filePath}`,
    JSON.stringify(annotations),
  );
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: `ann_${Math.random().toString(36).slice(2, 8)}`,
    position: { index: 1 },
    style: { color: 'yellow' },
    note: '',
    voiceIds: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useAnnotations', () => {
  describe('initialization', () => {
    it('starts with empty annotations for fresh file', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      expect(result.current.annotations).toEqual([]);
      expect(result.current.bookmarks).toEqual([]);
      expect(result.current.highlights).toEqual([]);
    });

    it('loads existing annotations from localStorage', () => {
      const bookmark = makeAnnotation({ id: 'bm-1', position: { index: 5 } });
      seedAnnotations(TEST_FILE, [bookmark]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      expect(result.current.annotations).toHaveLength(1);
      expect(result.current.annotations[0].id).toBe('bm-1');
    });
  });

  describe('bookmarks', () => {
    it('addBookmark creates a bookmark (no textSelection or region)', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      const position: DocumentPosition = { index: 3, fraction: 0.15 };

      act(() => {
        result.current.addBookmark(position, 'Chapter 3');
      });

      expect(result.current.annotations).toHaveLength(1);
      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.highlights).toHaveLength(0);

      const bm = result.current.bookmarks[0];
      expect(bm.position.index).toBe(3);
      expect(bm.position.fraction).toBe(0.15);
      expect(bm.chapter).toBe('Chapter 3');
      expect(bm.style.color).toBe('yellow');
      expect(bm.textSelection).toBeUndefined();
      expect(bm.region).toBeUndefined();
    });

    it('removeBookmark removes by id', () => {
      const bm = makeAnnotation({ id: 'bm-remove' });
      seedAnnotations(TEST_FILE, [bm]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      expect(result.current.annotations).toHaveLength(1);

      act(() => {
        result.current.removeBookmark('bm-remove');
      });

      expect(result.current.annotations).toHaveLength(0);
    });

    it('isBookmarked returns true when matcher matches', () => {
      const bm = makeAnnotation({ id: 'bm-check', position: { index: 7 } });
      seedAnnotations(TEST_FILE, [bm]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      expect(result.current.isBookmarked((a) => a.position.index === 7)).toBe(true);
      expect(result.current.isBookmarked((a) => a.position.index === 99)).toBe(false);
    });

    it('findBookmark returns matching bookmark', () => {
      const bm = makeAnnotation({ id: 'bm-find', position: { index: 10 } });
      seedAnnotations(TEST_FILE, [bm]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      const found = result.current.findBookmark((a) => a.position.index === 10);
      expect(found).toBeDefined();
      expect(found!.id).toBe('bm-find');

      const notFound = result.current.findBookmark((a) => a.position.index === 999);
      expect(notFound).toBeUndefined();
    });

    it('toggleBookmark adds when not present, removes when present', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      const position: DocumentPosition = { index: 5 };
      const matcher = (a: Annotation) => a.position.index === 5;

      // Add
      let nowBookmarked: boolean = false;
      act(() => {
        nowBookmarked = result.current.toggleBookmark(matcher, position, 'Page 5');
      });
      expect(nowBookmarked).toBe(true);
      expect(result.current.bookmarks).toHaveLength(1);

      // Remove
      act(() => {
        nowBookmarked = result.current.toggleBookmark(matcher, position, 'Page 5');
      });
      expect(nowBookmarked).toBe(false);
      expect(result.current.bookmarks).toHaveLength(0);
    });
  });

  describe('highlights', () => {
    it('addHighlight creates a text highlight', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      let added: Annotation | undefined;
      act(() => {
        added = result.current.addHighlight({
          position: { index: 2 },
          textSelection: { text: 'hello world' },
          color: 'green',
          chapter: 'Ch 2',
          note: 'important',
        });
      });

      expect(result.current.highlights).toHaveLength(1);
      expect(result.current.bookmarks).toHaveLength(0);

      const hl = result.current.highlights[0];
      expect(hl.textSelection?.text).toBe('hello world');
      expect(hl.style.color).toBe('green');
      expect(hl.note).toBe('important');
      expect(hl.chapter).toBe('Ch 2');
      expect(added!.id).toBe(hl.id);
    });

    it('addHighlight creates a region highlight', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.addHighlight({
          position: { index: 4 },
          region: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
          color: 'red',
        });
      });

      expect(result.current.highlights).toHaveLength(1);
      const hl = result.current.highlights[0];
      expect(hl.region).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
    });

    it('removeHighlight removes and returns the removed annotation', () => {
      const hl = makeAnnotation({
        id: 'hl-1',
        textSelection: { text: 'test' },
      });
      seedAnnotations(TEST_FILE, [hl]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      let removed: Annotation | undefined;
      act(() => {
        removed = result.current.removeHighlight('hl-1');
      });

      expect(removed).toBeDefined();
      expect(removed!.id).toBe('hl-1');
      expect(result.current.highlights).toHaveLength(0);
    });

    it('removeHighlight returns undefined for nonexistent id', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      let removed: Annotation | undefined;
      act(() => {
        removed = result.current.removeHighlight('nonexistent');
      });

      expect(removed).toBeUndefined();
    });
  });

  describe('general actions', () => {
    it('removeAnnotationById removes any annotation', () => {
      const bm = makeAnnotation({ id: 'any-1' });
      const hl = makeAnnotation({ id: 'any-2', textSelection: { text: 'x' } });
      seedAnnotations(TEST_FILE, [bm, hl]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      expect(result.current.annotations).toHaveLength(2);

      act(() => {
        result.current.removeAnnotationById('any-1');
      });
      expect(result.current.annotations).toHaveLength(1);
      expect(result.current.annotations[0].id).toBe('any-2');
    });

    it('updateNote updates annotation note', () => {
      const ann = makeAnnotation({ id: 'note-1', note: 'old' });
      seedAnnotations(TEST_FILE, [ann]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.updateNote('note-1', 'new note content');
      });

      expect(result.current.annotations[0].note).toBe('new note content');
    });
  });

  describe('voice linking', () => {
    it('voiceLinked adds a voiceId to the annotation', () => {
      const ann = makeAnnotation({ id: 'voice-1', voiceIds: [] });
      seedAnnotations(TEST_FILE, [ann]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.voiceLinked('voice-1', 'vc-abc');
      });

      expect(result.current.annotations[0].voiceIds).toContain('vc-abc');
    });

    it('voiceLinked can link multiple voice comments', () => {
      const ann = makeAnnotation({ id: 'voice-2', voiceIds: ['vc-1'] });
      seedAnnotations(TEST_FILE, [ann]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.voiceLinked('voice-2', 'vc-2');
      });

      expect(result.current.annotations[0].voiceIds).toEqual(['vc-1', 'vc-2']);
    });

    it('voiceUnlinked removes a voiceId', () => {
      const ann = makeAnnotation({ id: 'voice-3', voiceIds: ['vc-1', 'vc-2'] });
      seedAnnotations(TEST_FILE, [ann]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.voiceUnlinked('voice-3', 'vc-1');
      });

      expect(result.current.annotations[0].voiceIds).toEqual(['vc-2']);
    });

    it('autoCreateForVoice creates annotation and links voice in one step', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));
      const position: DocumentPosition = { index: 8 };

      act(() => {
        result.current.autoCreateForVoice('vc-new', position, 'Page 8');
      });

      expect(result.current.annotations).toHaveLength(1);
      const ann = result.current.annotations[0];
      expect(ann.position.index).toBe(8);
      expect(ann.chapter).toBe('Page 8');
      expect(ann.voiceIds).toContain('vc-new');
    });
  });

  describe('persistence', () => {
    it('saves annotations to localStorage on change', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.addBookmark({ index: 1 }, 'Ch 1');
      });

      const stored = JSON.parse(
        localStorage.getItem(`libreader:annotations:${TEST_FILE}`) || '[]',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].position.index).toBe(1);
    });
  });

  describe('derived values', () => {
    it('separates bookmarks and highlights correctly', () => {
      const bm1 = makeAnnotation({ id: 'bm-a' });
      const bm2 = makeAnnotation({ id: 'bm-b', position: { index: 2 } });
      const hl1 = makeAnnotation({ id: 'hl-a', textSelection: { text: 'abc' } });
      const hl2 = makeAnnotation({ id: 'hl-b', region: { x: 0, y: 0, w: 1, h: 1 } });
      seedAnnotations(TEST_FILE, [bm1, bm2, hl1, hl2]);

      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      expect(result.current.annotations).toHaveLength(4);
      expect(result.current.bookmarks).toHaveLength(2);
      expect(result.current.highlights).toHaveLength(2);
    });

    it('updates derived arrays when annotations change', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      act(() => {
        result.current.addBookmark({ index: 1 });
      });
      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.highlights).toHaveLength(0);

      act(() => {
        result.current.addHighlight({
          position: { index: 2 },
          textSelection: { text: 'text' },
          color: 'blue',
        });
      });
      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.highlights).toHaveLength(1);
    });
  });

  describe('multiple operations', () => {
    it('handles add, update, remove sequence correctly', () => {
      const { result } = renderHook(() => useAnnotations(TEST_FILE));

      // Add bookmark
      act(() => {
        result.current.addBookmark({ index: 1 }, 'Page 1');
      });
      expect(result.current.annotations).toHaveLength(1);
      const bmId = result.current.annotations[0].id;

      // Add highlight
      act(() => {
        result.current.addHighlight({
          position: { index: 2 },
          textSelection: { text: 'test' },
          color: 'green',
        });
      });
      expect(result.current.annotations).toHaveLength(2);

      // Update note on bookmark
      act(() => {
        result.current.updateNote(bmId, 'a note');
      });
      expect(result.current.annotations.find((a) => a.id === bmId)?.note).toBe('a note');

      // Remove bookmark
      act(() => {
        result.current.removeAnnotationById(bmId);
      });
      expect(result.current.annotations).toHaveLength(1);
      expect(result.current.bookmarks).toHaveLength(0);
      expect(result.current.highlights).toHaveLength(1);
    });
  });
});
