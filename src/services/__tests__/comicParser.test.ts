/**
 * Tests for comicParser service.
 * Tests CBZ extraction, spread building, and dimension loading.
 */
import { describe, it, expect, vi } from 'vitest';
import { zipSync } from 'fflate';
import { buildSpreads, cleanupPages, extractCbz, type ComicPage } from '@/services/comicParser';

// ---- Helpers ----

function makePage(overrides: Partial<ComicPage> = {}): ComicPage {
  return {
    name: 'page-001.jpg',
    blob: new Blob(['fake'], { type: 'image/jpeg' }),
    url: `blob:test-${Math.random()}`,
    width: 800,
    height: 1200,
    isWide: false,
    ...overrides,
  };
}

function makePages(count: number, wideIndices: number[] = []): ComicPage[] {
  return Array.from({ length: count }, (_, i) =>
    makePage({
      name: `page-${String(i + 1).padStart(3, '0')}.jpg`,
      url: `blob:page-${i}`,
      isWide: wideIndices.includes(i),
      width: wideIndices.includes(i) ? 1600 : 800,
      height: wideIndices.includes(i) ? 1000 : 1200,
    })
  );
}

// ---- Tests ----

describe('comicParser', () => {
  describe('buildSpreads', () => {
    it('first page is always single (cover)', () => {
      const pages = makePages(4);
      const spreads = buildSpreads(pages);
      expect(spreads[0]).toEqual([0]); // Cover alone
    });

    it('pairs consecutive portrait pages after cover', () => {
      const pages = makePages(5);
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([
        [0],       // cover
        [1, 2],    // spread
        [3, 4],    // spread
      ]);
    });

    it('keeps wide pages as single', () => {
      const pages = makePages(5, [2]); // page 2 is wide
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([
        [0],       // cover
        [1],       // solo (next is wide)
        [2],       // wide page, solo
        [3, 4],    // spread
      ]);
    });

    it('handles odd number of pages (last page solo)', () => {
      const pages = makePages(4);
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([
        [0],       // cover
        [1, 2],    // spread
        [3],       // solo (odd last)
      ]);
    });

    it('handles single page', () => {
      const pages = makePages(1);
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([[0]]);
    });

    it('handles empty pages', () => {
      const spreads = buildSpreads([]);
      expect(spreads).toEqual([]);
    });

    it('handles two pages', () => {
      const pages = makePages(2);
      const spreads = buildSpreads(pages);
      // Cover is solo, second page is solo
      expect(spreads).toEqual([[0], [1]]);
    });

    it('handles three pages', () => {
      const pages = makePages(3);
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([
        [0],       // cover
        [1, 2],    // spread
      ]);
    });

    describe('RTL mode', () => {
      it('reverses pair order in RTL', () => {
        const pages = makePages(5);
        const spreads = buildSpreads(pages, true);
        expect(spreads).toEqual([
          [0],       // cover still solo
          [2, 1],    // reversed pair
          [4, 3],    // reversed pair
        ]);
      });

      it('keeps wide pages solo in RTL', () => {
        const pages = makePages(5, [2]);
        const spreads = buildSpreads(pages, true);
        expect(spreads[0]).toEqual([0]); // cover
        expect(spreads).toContainEqual([2]); // wide still solo
      });

      it('cover is still first and solo in RTL', () => {
        const pages = makePages(3);
        const spreads = buildSpreads(pages, true);
        expect(spreads[0]).toEqual([0]);
      });
    });

    it('handles all wide pages', () => {
      const pages = makePages(4, [0, 1, 2, 3]);
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([[0], [1], [2], [3]]);
    });

    it('wide page after cover is solo', () => {
      const pages = makePages(3, [1]);
      const spreads = buildSpreads(pages);
      expect(spreads).toEqual([
        [0],   // cover
        [1],   // wide
        [2],   // solo last
      ]);
    });
  });

  describe('cleanupPages', () => {
    it('revokes all blob URLs', () => {
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { ...URL, revokeObjectURL });

      const pages = [
        makePage({ url: 'blob:a' }),
        makePage({ url: 'blob:b' }),
        makePage({ url: 'blob:c' }),
      ];
      cleanupPages(pages);

      expect(revokeObjectURL).toHaveBeenCalledTimes(3);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:a');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:b');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:c');

      vi.unstubAllGlobals();
    });

    it('handles empty array', () => {
      cleanupPages([]); // Should not throw
    });
  });

  describe('extractCbz', () => {
    /** Create a minimal 1x1 JPEG as raw bytes (smallest valid JPEG). */
    function tinyJpeg(): Uint8Array {
      return new Uint8Array([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
        0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
        0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
        0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
        0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0xD9,
      ]);
    }

    /** Create a minimal PNG (1x1 red pixel). */
    function tinyPng(): Uint8Array {
      return new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x36, 0x28, 0x19, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
      ]);
    }

    function makeZip(files: Record<string, Uint8Array>): ArrayBuffer {
      const zipped = zipSync(files);
      return zipped.buffer as ArrayBuffer;
    }

    it('extracts images from a simple ZIP in sorted order', () => {
      const data = makeZip({
        'page-003.jpg': tinyJpeg(),
        'page-001.jpg': tinyJpeg(),
        'page-002.jpg': tinyJpeg(),
      });

      const pages = extractCbz(data);

      expect(pages).toHaveLength(3);
      expect(pages[0].name).toBe('page-001.jpg');
      expect(pages[1].name).toBe('page-002.jpg');
      expect(pages[2].name).toBe('page-003.jpg');

      // Each page should have a blob URL
      for (const page of pages) {
        expect(page.url).toMatch(/^blob:/);
        expect(page.blob).toBeInstanceOf(Blob);
      }

      cleanupPages(pages);
    });

    it('filters out non-image files', () => {
      const data = makeZip({
        'page-001.jpg': tinyJpeg(),
        'readme.txt': new Uint8Array([72, 101, 108, 108, 111]),
        'metadata.xml': new Uint8Array([60, 120, 62]),
        'page-002.png': tinyPng(),
      });

      const pages = extractCbz(data);

      expect(pages).toHaveLength(2);
      expect(pages[0].name).toBe('page-001.jpg');
      expect(pages[1].name).toBe('page-002.png');

      cleanupPages(pages);
    });

    it('filters out __MACOSX entries', () => {
      const data = makeZip({
        'page-001.jpg': tinyJpeg(),
        '__MACOSX/._page-001.jpg': new Uint8Array([0, 0]),
        '__MACOSX/.DS_Store': new Uint8Array([0]),
      });

      const pages = extractCbz(data);

      expect(pages).toHaveLength(1);
      expect(pages[0].name).toBe('page-001.jpg');

      cleanupPages(pages);
    });

    it('handles images in subdirectories', () => {
      const data = makeZip({
        'comic/images/page-001.jpg': tinyJpeg(),
        'comic/images/page-002.jpg': tinyJpeg(),
      });

      const pages = extractCbz(data);

      expect(pages).toHaveLength(2);
      // name should be just the filename (no directory path)
      expect(pages[0].name).toBe('page-001.jpg');
      expect(pages[1].name).toBe('page-002.jpg');

      cleanupPages(pages);
    });

    it('assigns correct MIME types', () => {
      const data = makeZip({
        'page.jpg': tinyJpeg(),
        'page.png': tinyPng(),
      });

      const pages = extractCbz(data);

      expect(pages[0].blob.type).toBe('image/jpeg');
      expect(pages[1].blob.type).toBe('image/png');

      cleanupPages(pages);
    });

    it('returns empty array for ZIP with no images', () => {
      const data = makeZip({
        'readme.txt': new Uint8Array([72, 101, 108, 108, 111]),
      });

      const pages = extractCbz(data);
      expect(pages).toHaveLength(0);
    });

    it('sorts numerically (page-2 before page-10)', () => {
      const data = makeZip({
        'page-10.jpg': tinyJpeg(),
        'page-2.jpg': tinyJpeg(),
        'page-1.jpg': tinyJpeg(),
      });

      const pages = extractCbz(data);

      expect(pages[0].name).toBe('page-1.jpg');
      expect(pages[1].name).toBe('page-2.jpg');
      expect(pages[2].name).toBe('page-10.jpg');

      cleanupPages(pages);
    });
  });
});
