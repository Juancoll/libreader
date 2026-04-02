/**
 * Tests for the unified annotation system.
 *
 * Covers:
 * - annotation.ts: isBookmark, generateAnnotationId
 * - annotationService.ts: CRUD, queries, conversions, voice linking, legacy migration
 *
 * These tests exercise comic region annotations, PDF text+region annotations,
 * EPUB CFI annotations, and Markdown offset annotations — all via the same unified API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isBookmark, generateAnnotationId } from '@/types/annotation';
import type { Annotation, HighlightColor } from '@/types/annotation';
import {
  loadAnnotations,
  saveAnnotations,
  addAnnotation,
  removeAnnotation,
  updateAnnotationNote,
  linkVoiceToAnnotation,
  unlinkVoiceFromAnnotation,
  getHighlights,
  getBookmarks,
  getHighlightsForPages,
  toBookmarkEntries,
  toHighlightEntries,
} from '@/services/annotationService';

// ---- Helpers to create test annotations ----

function makeBookmark(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'bm-1',
    position: { index: 5, fraction: 0.1 },
    style: { color: 'yellow' },
    note: '',
    voiceIds: [],
    chapter: 'Pagina 5',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTextHighlight(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'hl-text-1',
    position: { index: 3, fraction: 0.06 },
    textSelection: {
      text: 'highlighted text',
      startItemIdx: 2,
      startCharOffset: 0,
      endItemIdx: 4,
      endCharOffset: 10,
    },
    style: { color: 'green' },
    note: 'my note',
    voiceIds: [],
    chapter: 'Pagina 3',
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeRegionHighlight(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'hl-region-1',
    position: { index: 7, fraction: 0.14 },
    region: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
    style: { color: 'blue' },
    note: '',
    voiceIds: [],
    chapter: 'Pagina 7',
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
    ...overrides,
  };
}

function makeEpubHighlight(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'hl-epub-1',
    position: { cfi: 'epubcfi(/6/14!/4/2/1:0)', fraction: 0.25 },
    textSelection: {
      text: 'epub highlighted text',
      cfiRange: 'epubcfi(/6/14!/4/2/1:0,/6/14!/4/2/1:20)',
    },
    style: { color: 'purple' },
    note: '',
    voiceIds: [],
    chapter: 'Chapter 3',
    createdAt: '2025-01-04T00:00:00.000Z',
    updatedAt: '2025-01-04T00:00:00.000Z',
    ...overrides,
  };
}

function makeMdHighlight(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'hl-md-1',
    position: { fraction: 0.4 },
    textSelection: {
      text: 'markdown selection',
      startOffset: 100,
      endOffset: 118,
    },
    style: { color: 'red' },
    note: 'md note',
    voiceIds: [],
    chapter: 'Nota',
    createdAt: '2025-01-05T00:00:00.000Z',
    updatedAt: '2025-01-05T00:00:00.000Z',
    ...overrides,
  };
}

// ---- annotation.ts tests ----

describe('annotation.ts', () => {
  describe('isBookmark', () => {
    it('returns true for annotation with only position (no textSelection, no region)', () => {
      expect(isBookmark(makeBookmark())).toBe(true);
    });

    it('returns false for annotation with textSelection', () => {
      expect(isBookmark(makeTextHighlight())).toBe(false);
    });

    it('returns false for annotation with region', () => {
      expect(isBookmark(makeRegionHighlight())).toBe(false);
    });

    it('returns false for annotation with both textSelection and region', () => {
      const ann = makeTextHighlight({ region: { x: 0, y: 0, w: 1, h: 1 } });
      expect(isBookmark(ann)).toBe(false);
    });

    it('returns true for bookmark with a note (bookmark can have notes)', () => {
      expect(isBookmark(makeBookmark({ note: 'some note' }))).toBe(true);
    });

    it('returns true for bookmark with voiceIds (bookmark can have voice)', () => {
      expect(isBookmark(makeBookmark({ voiceIds: ['v1'] }))).toBe(true);
    });
  });

  describe('generateAnnotationId', () => {
    it('returns a string starting with "ann_"', () => {
      expect(generateAnnotationId()).toMatch(/^ann_/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateAnnotationId()));
      expect(ids.size).toBe(100);
    });

    it('contains a timestamp component', () => {
      const id = generateAnnotationId();
      const parts = id.split('_');
      expect(parts.length).toBe(3);
      const timestamp = Number(parts[1]);
      expect(timestamp).toBeGreaterThan(Date.now() - 5000);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });
  });
});

// ---- annotationService.ts tests ----

describe('annotationService.ts', () => {
  const testPath = 'test/book.cbz';

  beforeEach(() => {
    localStorage.clear();
  });

  // ---- CRUD ----

  describe('loadAnnotations / saveAnnotations', () => {
    it('returns empty array for unknown file', () => {
      expect(loadAnnotations('nonexistent/file.cbz')).toEqual([]);
    });

    it('round-trips through save and load', () => {
      const anns = [makeBookmark(), makeRegionHighlight()];
      saveAnnotations(testPath, anns);
      const loaded = loadAnnotations(testPath);
      expect(loaded).toEqual(anns);
    });

    it('overwrites previous annotations on save', () => {
      saveAnnotations(testPath, [makeBookmark()]);
      saveAnnotations(testPath, [makeRegionHighlight()]);
      const loaded = loadAnnotations(testPath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('hl-region-1');
    });
  });

  describe('addAnnotation', () => {
    it('adds a text highlight annotation', () => {
      const { annotations, added } = addAnnotation(testPath, [], {
        position: { index: 3, fraction: 0.06 },
        textSelection: { text: 'hello', startItemIdx: 0, endItemIdx: 1, startCharOffset: 0, endCharOffset: 5 },
        color: 'green',
        chapter: 'Pagina 3',
      });
      expect(annotations).toHaveLength(1);
      expect(added.textSelection?.text).toBe('hello');
      expect(added.style.color).toBe('green');
      expect(added.id).toMatch(/^ann_/);
    });

    it('adds a region annotation (comic-style)', () => {
      const { annotations, added } = addAnnotation(testPath, [], {
        position: { index: 7 },
        region: { x: 0.1, y: 0.2, w: 0.5, h: 0.3 },
        color: 'blue',
        chapter: 'Pagina 7',
      });
      expect(annotations).toHaveLength(1);
      expect(added.region).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
      expect(isBookmark(added)).toBe(false);
    });

    it('adds a bookmark (no text, no region)', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        color: 'yellow',
      });
      expect(isBookmark(added)).toBe(true);
    });

    it('adds an EPUB CFI annotation', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { cfi: 'epubcfi(/6/14!/4/2/1:0)', fraction: 0.25 },
        textSelection: { text: 'epub text', cfiRange: 'epubcfi(/6/14!/4/2/1:0,/6/14!/4/2/1:9)' },
        color: 'purple',
      });
      expect(added.position.cfi).toBe('epubcfi(/6/14!/4/2/1:0)');
      expect(added.textSelection?.cfiRange).toContain('epubcfi');
    });

    it('adds a Markdown offset annotation', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { fraction: 0.4 },
        textSelection: { text: 'md text', startOffset: 100, endOffset: 107 },
        color: 'red',
      });
      expect(added.textSelection?.startOffset).toBe(100);
      expect(added.textSelection?.endOffset).toBe(107);
    });

    it('appends to existing annotations', () => {
      const existing = [makeBookmark()];
      const { annotations } = addAnnotation(testPath, existing, {
        position: { index: 10 },
        region: { x: 0, y: 0, w: 1, h: 1 },
        color: 'red',
      });
      expect(annotations).toHaveLength(2);
      expect(annotations[0].id).toBe('bm-1');
    });

    it('persists to localStorage', () => {
      addAnnotation(testPath, [], {
        position: { index: 1 },
        color: 'yellow',
      });
      const loaded = loadAnnotations(testPath);
      expect(loaded).toHaveLength(1);
    });

    it('sets note to empty string when not provided', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        color: 'yellow',
      });
      expect(added.note).toBe('');
    });

    it('uses provided note when given', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        color: 'yellow',
        note: 'my note',
      });
      expect(added.note).toBe('my note');
    });

    it('initializes voiceIds as empty array', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        color: 'yellow',
      });
      expect(added.voiceIds).toEqual([]);
    });

    it('sets createdAt and updatedAt to the same value', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        color: 'yellow',
      });
      expect(added.createdAt).toBe(added.updatedAt);
      // Should be a valid ISO date
      expect(new Date(added.createdAt).toISOString()).toBe(added.createdAt);
    });
  });

  describe('removeAnnotation', () => {
    it('removes the annotation with the given ID', () => {
      const anns = [makeBookmark(), makeRegionHighlight(), makeTextHighlight()];
      const updated = removeAnnotation(testPath, anns, 'hl-region-1');
      expect(updated).toHaveLength(2);
      expect(updated.find((a) => a.id === 'hl-region-1')).toBeUndefined();
    });

    it('does nothing if ID not found', () => {
      const anns = [makeBookmark()];
      const updated = removeAnnotation(testPath, anns, 'nonexistent');
      expect(updated).toHaveLength(1);
    });

    it('returns empty array when removing from empty list', () => {
      const updated = removeAnnotation(testPath, [], 'any-id');
      expect(updated).toEqual([]);
    });

    it('persists the updated list', () => {
      saveAnnotations(testPath, [makeBookmark(), makeRegionHighlight()]);
      removeAnnotation(testPath, [makeBookmark(), makeRegionHighlight()], 'bm-1');
      const loaded = loadAnnotations(testPath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('hl-region-1');
    });
  });

  describe('updateAnnotationNote', () => {
    it('updates the note of the specified annotation', () => {
      const anns = [makeBookmark(), makeRegionHighlight()];
      const updated = updateAnnotationNote(testPath, anns, 'bm-1', 'new note');
      const found = updated.find((a) => a.id === 'bm-1');
      expect(found?.note).toBe('new note');
    });

    it('updates updatedAt timestamp', () => {
      const anns = [makeBookmark()];
      const updated = updateAnnotationNote(testPath, anns, 'bm-1', 'note');
      const found = updated.find((a) => a.id === 'bm-1');
      expect(found?.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('does not modify other annotations', () => {
      const anns = [makeBookmark(), makeRegionHighlight()];
      const updated = updateAnnotationNote(testPath, anns, 'bm-1', 'note');
      const other = updated.find((a) => a.id === 'hl-region-1');
      expect(other?.note).toBe(''); // unchanged
      expect(other?.updatedAt).toBe('2025-01-03T00:00:00.000Z'); // unchanged
    });

    it('persists the updated list', () => {
      saveAnnotations(testPath, [makeBookmark()]);
      updateAnnotationNote(testPath, [makeBookmark()], 'bm-1', 'persisted note');
      const loaded = loadAnnotations(testPath);
      expect(loaded[0].note).toBe('persisted note');
    });

    it('returns array unchanged when ID does not exist', () => {
      const anns = [makeBookmark(), makeRegionHighlight()];
      const updated = updateAnnotationNote(testPath, anns, 'nonexistent-id', 'note');
      expect(updated).toHaveLength(2);
      expect(updated[0].note).toBe('');
      expect(updated[1].note).toBe('');
    });
  });

  // ---- Voice linking ----

  describe('linkVoiceToAnnotation', () => {
    it('adds a voice ID to the annotation', () => {
      const anns = [makeBookmark()];
      const updated = linkVoiceToAnnotation(testPath, anns, 'bm-1', 'voice-1');
      expect(updated[0].voiceIds).toEqual(['voice-1']);
    });

    it('appends to existing voice IDs', () => {
      const anns = [makeBookmark({ voiceIds: ['voice-1'] })];
      const updated = linkVoiceToAnnotation(testPath, anns, 'bm-1', 'voice-2');
      expect(updated[0].voiceIds).toEqual(['voice-1', 'voice-2']);
    });

    it('allows duplicate voice IDs (no dedup guard)', () => {
      const anns = [makeBookmark({ voiceIds: ['voice-1'] })];
      const updated = linkVoiceToAnnotation(testPath, anns, 'bm-1', 'voice-1');
      expect(updated[0].voiceIds).toEqual(['voice-1', 'voice-1']);
    });

    it('updates updatedAt timestamp', () => {
      const anns = [makeBookmark()];
      const updated = linkVoiceToAnnotation(testPath, anns, 'bm-1', 'voice-1');
      expect(updated[0].updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('unlinkVoiceFromAnnotation', () => {
    it('removes a voice ID from the annotation', () => {
      const anns = [makeBookmark({ voiceIds: ['voice-1', 'voice-2'] })];
      const updated = unlinkVoiceFromAnnotation(testPath, anns, 'bm-1', 'voice-1');
      expect(updated[0].voiceIds).toEqual(['voice-2']);
    });

    it('does nothing if voice ID not found', () => {
      const anns = [makeBookmark({ voiceIds: ['voice-1'] })];
      const updated = unlinkVoiceFromAnnotation(testPath, anns, 'bm-1', 'voice-99');
      expect(updated[0].voiceIds).toEqual(['voice-1']);
    });
  });

  // ---- Queries ----

  describe('getHighlights', () => {
    it('returns only annotations with textSelection or region', () => {
      const anns = [makeBookmark(), makeTextHighlight(), makeRegionHighlight()];
      const hl = getHighlights(anns);
      expect(hl).toHaveLength(2);
      expect(hl.map((a) => a.id)).toEqual(['hl-text-1', 'hl-region-1']);
    });

    it('returns empty for bookmarks only', () => {
      expect(getHighlights([makeBookmark()])).toEqual([]);
    });

    it('includes EPUB and Markdown highlights', () => {
      const anns = [makeEpubHighlight(), makeMdHighlight()];
      expect(getHighlights(anns)).toHaveLength(2);
    });
  });

  describe('getBookmarks', () => {
    it('returns only annotations without textSelection or region', () => {
      const anns = [makeBookmark(), makeTextHighlight(), makeRegionHighlight()];
      const bm = getBookmarks(anns);
      expect(bm).toHaveLength(1);
      expect(bm[0].id).toBe('bm-1');
    });

    it('returns empty when no bookmarks', () => {
      expect(getBookmarks([makeTextHighlight()])).toEqual([]);
    });
  });

  describe('getHighlightsForPages', () => {
    it('returns highlights matching specified page numbers', () => {
      const anns = [
        makeTextHighlight({ id: 'p3', position: { index: 3 } }),
        makeRegionHighlight({ id: 'p7', position: { index: 7 } }),
        makeTextHighlight({ id: 'p5', position: { index: 5 } }),
        makeBookmark({ id: 'bm-p3', position: { index: 3 } }),
      ];
      const result = getHighlightsForPages(anns, [3, 5]);
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id).sort()).toEqual(['p3', 'p5']);
    });

    it('excludes bookmarks even if on matching pages', () => {
      const anns = [makeBookmark({ position: { index: 3 } })];
      expect(getHighlightsForPages(anns, [3])).toEqual([]);
    });

    it('returns empty for empty page list', () => {
      const anns = [makeTextHighlight()];
      expect(getHighlightsForPages(anns, [])).toEqual([]);
    });

    it('handles annotations without index gracefully', () => {
      const anns = [makeEpubHighlight()]; // has cfi + fraction but no index
      expect(getHighlightsForPages(anns, [1, 2, 3])).toEqual([]);
    });
  });

  // ---- Conversions ----

  describe('toBookmarkEntries', () => {
    it('converts bookmarks to BookmarkEntry format', () => {
      const anns = [makeBookmark(), makeTextHighlight()];
      const entries = toBookmarkEntries(anns, 50);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: 'bm-1',
        page: 5,
        chapter: 'Pagina 5',
      });
    });

    it('computes percentage from fraction when available', () => {
      const anns = [makeBookmark({ position: { index: 10, fraction: 0.5 } })];
      const entries = toBookmarkEntries(anns, 20);
      expect(entries[0].percentage).toBe(50);
    });

    it('computes percentage from index/totalPages when fraction is absent', () => {
      const anns = [makeBookmark({ position: { index: 10 } })];
      const entries = toBookmarkEntries(anns, 50);
      expect(entries[0].percentage).toBe(20);
    });

    it('handles bookmark with CFI position', () => {
      const anns = [makeBookmark({ position: { cfi: 'epubcfi(/6/2)', fraction: 0.1 } })];
      const entries = toBookmarkEntries(anns, 100);
      expect(entries[0].cfi).toBe('epubcfi(/6/2)');
    });
  });

  describe('toHighlightEntries', () => {
    it('converts text highlights to HighlightEntry format', () => {
      const anns = [makeTextHighlight(), makeBookmark()];
      const entries = toHighlightEntries(anns);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: 'hl-text-1',
        text: 'highlighted text',
        color: 'green',
        note: 'my note',
        page: 3,
      });
    });

    it('converts region highlights with descriptive text', () => {
      const anns = [makeRegionHighlight()];
      const entries = toHighlightEntries(anns);
      expect(entries).toHaveLength(1);
      expect(entries[0].text).toBe('[Region 10%,20%]');
    });

    it('converts EPUB highlights with cfiRange', () => {
      const anns = [makeEpubHighlight()];
      const entries = toHighlightEntries(anns);
      expect(entries[0].cfiRange).toContain('epubcfi');
      expect(entries[0].text).toBe('epub highlighted text');
    });

    it('converts Markdown highlights', () => {
      const anns = [makeMdHighlight()];
      const entries = toHighlightEntries(anns);
      expect(entries[0].text).toBe('markdown selection');
      expect(entries[0].note).toBe('md note');
    });
  });

  // ---- Region annotation specifics (comic + PDF) ----

  describe('region annotations (comic & PDF)', () => {
    it('creates a comic-style region annotation with page index', () => {
      const { added } = addAnnotation(testPath, [], {
        position: { index: 12 },
        region: { x: 0.25, y: 0.1, w: 0.5, h: 0.8 },
        color: 'yellow',
        chapter: 'Pagina 12',
      });
      expect(added.region).toEqual({ x: 0.25, y: 0.1, w: 0.5, h: 0.8 });
      expect(added.position.index).toBe(12);
      expect(isBookmark(added)).toBe(false);
    });

    it('region annotations are classified as highlights', () => {
      const anns = [
        makeRegionHighlight({ id: 'r1', position: { index: 1 } }),
        makeRegionHighlight({ id: 'r2', position: { index: 2 } }),
        makeBookmark({ id: 'b1', position: { index: 1 } }),
      ];
      expect(getHighlights(anns)).toHaveLength(2);
      expect(getBookmarks(anns)).toHaveLength(1);
    });

    it('region annotations appear in getHighlightsForPages', () => {
      const anns = [
        makeRegionHighlight({ id: 'r1', position: { index: 5 } }),
        makeRegionHighlight({ id: 'r2', position: { index: 10 } }),
      ];
      const result = getHighlightsForPages(anns, [5]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r1');
    });

    it('region coordinates are preserved exactly', () => {
      const region = { x: 0.123456, y: 0.654321, w: 0.111111, h: 0.222222 };
      const { annotations } = addAnnotation(testPath, [], {
        position: { index: 1 },
        region,
        color: 'red',
      });
      saveAnnotations(testPath, annotations);
      const loaded = loadAnnotations(testPath);
      expect(loaded[0].region).toEqual(region);
    });

    it('multiple region annotations on the same page', () => {
      let anns: Annotation[] = [];
      const r1 = addAnnotation(testPath, anns, {
        position: { index: 3 },
        region: { x: 0, y: 0, w: 0.5, h: 0.5 },
        color: 'yellow',
      });
      anns = r1.annotations;
      const r2 = addAnnotation(testPath, anns, {
        position: { index: 3 },
        region: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        color: 'blue',
      });
      anns = r2.annotations;

      expect(anns).toHaveLength(2);
      const page3 = getHighlightsForPages(anns, [3]);
      expect(page3).toHaveLength(2);
      expect(page3[0].style.color).not.toBe(page3[1].style.color);
    });

    it('can add note to region annotation', () => {
      const { annotations, added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        region: { x: 0, y: 0, w: 1, h: 1 },
        color: 'green',
      });
      const updated = updateAnnotationNote(testPath, annotations, added.id, 'region note');
      const found = updated.find((a) => a.id === added.id);
      expect(found?.note).toBe('region note');
    });

    it('can link voice to region annotation', () => {
      const { annotations, added } = addAnnotation(testPath, [], {
        position: { index: 1 },
        region: { x: 0, y: 0, w: 1, h: 1 },
        color: 'green',
      });
      const updated = linkVoiceToAnnotation(testPath, annotations, added.id, 'voice-99');
      expect(updated.find((a) => a.id === added.id)?.voiceIds).toEqual(['voice-99']);
    });

    it('region toHighlightEntries uses descriptive text', () => {
      const anns = [
        makeRegionHighlight({ region: { x: 0.33, y: 0.44, w: 0.2, h: 0.3 } }),
      ];
      const entries = toHighlightEntries(anns);
      expect(entries[0].text).toBe('[Region 33%,44%]');
    });
  });

  // ---- Mixed annotation scenarios ----

  describe('mixed annotation scenarios', () => {
    it('handles a mix of all annotation types', () => {
      const anns = [
        makeBookmark({ id: 'bm1' }),
        makeTextHighlight({ id: 'txt1' }),
        makeRegionHighlight({ id: 'reg1' }),
        makeEpubHighlight({ id: 'epub1' }),
        makeMdHighlight({ id: 'md1' }),
      ];

      expect(getBookmarks(anns)).toHaveLength(1);
      expect(getHighlights(anns)).toHaveLength(4);
    });

    it('all highlight colors are accepted', () => {
      const colors: HighlightColor[] = ['yellow', 'green', 'blue', 'red', 'purple'];
      let anns: Annotation[] = [];

      for (const color of colors) {
        const result = addAnnotation(testPath, anns, {
          position: { index: 1 },
          region: { x: 0, y: 0, w: 0.1, h: 0.1 },
          color,
        });
        anns = result.annotations;
      }

      expect(anns).toHaveLength(5);
      const usedColors = anns.map((a) => a.style.color);
      expect(usedColors).toEqual(colors);
    });

    it('remove + re-add does not cause duplicates', () => {
      let anns = [makeBookmark(), makeRegionHighlight()];
      anns = removeAnnotation(testPath, anns, 'bm-1');
      expect(anns).toHaveLength(1);

      const { annotations } = addAnnotation(testPath, anns, {
        position: { index: 5 },
        color: 'yellow',
      });
      expect(annotations).toHaveLength(2);
      // The new bookmark has a different ID
      expect(annotations.every((a, i) => annotations.findIndex((b) => b.id === a.id) === i)).toBe(true);
    });
  });

  // ---- Legacy migration ----

  describe('legacy migration', () => {
    it('migrates EPUB legacy highlights', () => {
      const legacyHighlights = [
        {
          cfiRange: 'epubcfi(/6/14!/4/2/1:0,/6/14!/4/2/1:20)',
          text: 'legacy epub text',
          color: 'green',
          note: 'old note',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      localStorage.setItem(
        'libreader:legacy/book.epub:highlights',
        JSON.stringify(legacyHighlights),
      );

      const loaded = loadAnnotations('legacy/book.epub');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].textSelection?.text).toBe('legacy epub text');
      expect(loaded[0].style.color).toBe('green');
      expect(loaded[0].note).toBe('old note');
      expect(loaded[0].position.cfi).toBe('epubcfi(/6/14!/4/2/1:0,/6/14!/4/2/1:20)');
    });

    it('migrates EPUB legacy bookmarks', () => {
      const legacyBookmarks = [
        {
          cfi: 'epubcfi(/6/2)',
          chapter: 'Chapter 1',
          percentage: 10,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      localStorage.setItem(
        'libreader:legacy/book.epub:bookmarks',
        JSON.stringify(legacyBookmarks),
      );

      const loaded = loadAnnotations('legacy/book.epub');
      expect(loaded).toHaveLength(1);
      expect(isBookmark(loaded[0])).toBe(true);
      expect(loaded[0].position.cfi).toBe('epubcfi(/6/2)');
      expect(loaded[0].chapter).toBe('Chapter 1');
    });

    it('migrates PDF legacy highlights', () => {
      const legacyHighlights = [
        {
          id: 'old-hl-1',
          page: 5,
          text: 'legacy pdf text',
          color: 'blue',
          note: '',
          startItemIdx: 0,
          startCharOffset: 0,
          endItemIdx: 3,
          endCharOffset: 10,
          createdAt: '2024-02-01T00:00:00.000Z',
        },
      ];
      localStorage.setItem(
        'libreader:pdf:legacy/doc.pdf:highlights',
        JSON.stringify(legacyHighlights),
      );

      const loaded = loadAnnotations('legacy/doc.pdf');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].position.index).toBe(5);
      expect(loaded[0].textSelection?.text).toBe('legacy pdf text');
      expect(loaded[0].textSelection?.startItemIdx).toBe(0);
      expect(loaded[0].textSelection?.endItemIdx).toBe(3);
    });

    it('migrates PDF legacy bookmarks', () => {
      const legacyBookmarks = [
        { page: 10, createdAt: '2024-02-01T00:00:00.000Z' },
      ];
      localStorage.setItem(
        'libreader:pdf:legacy/doc.pdf:bookmarks',
        JSON.stringify(legacyBookmarks),
      );

      const loaded = loadAnnotations('legacy/doc.pdf');
      expect(loaded).toHaveLength(1);
      expect(isBookmark(loaded[0])).toBe(true);
      expect(loaded[0].position.index).toBe(10);
    });

    it('migrates both EPUB highlights and bookmarks together', () => {
      localStorage.setItem(
        'libreader:legacy/mixed.epub:highlights',
        JSON.stringify([
          { cfiRange: 'epubcfi(/6/4)', text: 'hl', color: 'red', note: '', createdAt: '2024-01-01T00:00:00.000Z' },
        ]),
      );
      localStorage.setItem(
        'libreader:legacy/mixed.epub:bookmarks',
        JSON.stringify([
          { cfi: 'epubcfi(/6/2)', chapter: 'Ch1', percentage: 5, createdAt: '2024-01-01T00:00:00.000Z' },
        ]),
      );

      const loaded = loadAnnotations('legacy/mixed.epub');
      expect(loaded).toHaveLength(2);
      expect(getHighlights(loaded)).toHaveLength(1);
      expect(getBookmarks(loaded)).toHaveLength(1);
    });

    it('does not re-migrate if unified annotations already exist', () => {
      // Save a unified annotation
      saveAnnotations('legacy/saved.epub', [makeBookmark()]);

      // Set legacy data too
      localStorage.setItem(
        'libreader:legacy/saved.epub:highlights',
        JSON.stringify([
          { cfiRange: 'cfi', text: 'hl', color: 'red', note: '', createdAt: '2024-01-01T00:00:00.000Z' },
        ]),
      );

      const loaded = loadAnnotations('legacy/saved.epub');
      // Should return only the unified annotation, not the legacy one
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('bm-1');
    });
  });
});
