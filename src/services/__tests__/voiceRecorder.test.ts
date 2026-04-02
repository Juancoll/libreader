/**
 * Tests for voiceRecorder service.
 * Tests the pure functions and save/load/delete logic with mock FSAdapter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRecordingSupported,
  saveVoiceComment,
  loadVoiceComments,
  deleteVoiceComment,
} from '@/services/voiceRecorder';
import type { FSAdapter } from '@/services/vaultParser';

// ---- Mock FSAdapter ----

function createMockFS() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error('not found');
      return content;
    }),
    readBinaryFile: vi.fn().mockRejectedValue(new Error('not found')),
    writeFile: vi.fn().mockImplementation(async (path: string, content: string) => {
      files.set(path, content);
    }),
    mkdir: vi.fn().mockImplementation(async (path: string) => {
      dirs.add(path);
    }),
    exists: vi.fn().mockImplementation(async (path: string) => files.has(path)),
    getFileUrl: vi.fn().mockResolvedValue('blob:test'),
  } satisfies FSAdapter & { files: Map<string, string>; dirs: Set<string> };
}

// ---- Tests ----

describe('voiceRecorder', () => {
  describe('isRecordingSupported', () => {
    it('returns true when MediaRecorder and getUserMedia are available', () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn(),
        },
      });
      vi.stubGlobal('MediaRecorder', class {});

      expect(isRecordingSupported()).toBe(true);
      vi.unstubAllGlobals();
    });

    it('returns false when mediaDevices is missing', () => {
      vi.stubGlobal('navigator', {});
      vi.stubGlobal('MediaRecorder', class {});

      expect(isRecordingSupported()).toBe(false);
      vi.unstubAllGlobals();
    });

    it('returns false when MediaRecorder is missing', () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn(),
        },
      });
      // Remove MediaRecorder
      const origMR = (window as any).MediaRecorder;
      delete (window as any).MediaRecorder;

      expect(isRecordingSupported()).toBe(false);

      if (origMR) (window as any).MediaRecorder = origMR;
      vi.unstubAllGlobals();
    });
  });

  describe('saveVoiceComment', () => {
    let fs: ReturnType<typeof createMockFS>;

    beforeEach(() => {
      fs = createMockFS();
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:audio-url'),
        revokeObjectURL: vi.fn(),
      });
    });

    it('creates voice directory', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      await saveVoiceComment(fs, 'books/Book/Book.epub', blob, {
        id: 'vc-1',
        duration: 5.2,
        location: 'epubcfi(/6/14)',
        createdAt: '2025-06-15T10:00:00.000Z',
      });

      expect(fs.dirs.has('books/Book/Book.epub.reading/voice')).toBe(true);
    });

    it('writes audio as base64', async () => {
      const blob = new Blob(['hello'], { type: 'audio/webm' });
      await saveVoiceComment(fs, 'test.epub', blob, {
        id: 'vc-1',
        duration: 1,
        location: 'page-1',
        createdAt: '2025-01-01T00:00:00Z',
      });

      const b64Path = 'test.epub.reading/voice/vc-1.webm.b64';
      expect(fs.files.has(b64Path)).toBe(true);
      // base64 of "hello"
      const b64 = fs.files.get(b64Path)!;
      expect(b64).toBeTruthy();
    });

    it('creates and updates voice-comments.json index', async () => {
      const blob = new Blob(['audio'], { type: 'audio/webm' });
      await saveVoiceComment(fs, 'test.epub', blob, {
        id: 'vc-1',
        duration: 3,
        location: 'page-5',
        createdAt: '2025-01-01T00:00:00Z',
      });

      const indexPath = 'test.epub.reading/voice-comments.json';
      expect(fs.files.has(indexPath)).toBe(true);
      const index = JSON.parse(fs.files.get(indexPath)!);
      expect(index.comments).toHaveLength(1);
      expect(index.comments[0].id).toBe('vc-1');
      expect(index.comments[0].duration).toBe(3);
    });

    it('returns VoiceComment with blobUrl', async () => {
      const blob = new Blob(['audio'], { type: 'audio/ogg' });
      const result = await saveVoiceComment(fs, 'test.epub', blob, {
        id: 'vc-1',
        duration: 2,
        location: 'cfi-1',
        createdAt: '2025-01-01T00:00:00Z',
      });

      expect(result.id).toBe('vc-1');
      expect(result.filePath).toBeTruthy();
      expect(result.blobUrl).toBe('blob:audio-url');
    });

    it('appends to existing index', async () => {
      // Pre-populate index
      fs.files.set('test.epub.reading/voice-comments.json', JSON.stringify({
        file: 'test.epub',
        comments: [{ id: 'vc-0', filePath: 'old', duration: 1, location: 'p1', createdAt: '2025-01-01T00:00:00Z' }],
      }));

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      await saveVoiceComment(fs, 'test.epub', blob, {
        id: 'vc-1',
        duration: 5,
        location: 'p2',
        createdAt: '2025-01-02T00:00:00Z',
      });

      const index = JSON.parse(fs.files.get('test.epub.reading/voice-comments.json')!);
      expect(index.comments).toHaveLength(2);
    });

    it('includes selectedText when provided', async () => {
      const blob = new Blob(['audio'], { type: 'audio/webm' });
      await saveVoiceComment(fs, 'test.epub', blob, {
        id: 'vc-1',
        duration: 2,
        location: 'cfi-1',
        selectedText: 'Some highlighted text',
        createdAt: '2025-01-01T00:00:00Z',
      });

      const index = JSON.parse(fs.files.get('test.epub.reading/voice-comments.json')!);
      expect(index.comments[0].selectedText).toBe('Some highlighted text');
    });
  });

  describe('loadVoiceComments', () => {
    it('loads comments from index file', async () => {
      const fs = createMockFS();
      fs.files.set('test.epub.reading/voice-comments.json', JSON.stringify({
        file: 'test.epub',
        comments: [
          { id: 'vc-1', filePath: 'voice/vc-1.webm', duration: 3, location: 'p1', createdAt: '2025-01-01T00:00:00Z' },
          { id: 'vc-2', filePath: 'voice/vc-2.webm', duration: 5, location: 'p2', createdAt: '2025-01-02T00:00:00Z' },
        ],
      }));

      const comments = await loadVoiceComments(fs, 'test.epub');
      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe('vc-1');
      expect(comments[0].blobUrl).toBeUndefined(); // Not loaded
    });

    it('returns empty array when no index exists', async () => {
      const fs = createMockFS();
      const comments = await loadVoiceComments(fs, 'nonexistent.epub');
      expect(comments).toEqual([]);
    });
  });

  describe('deleteVoiceComment', () => {
    it('removes comment from index', async () => {
      const fs = createMockFS();
      fs.files.set('test.epub.reading/voice-comments.json', JSON.stringify({
        file: 'test.epub',
        comments: [
          { id: 'vc-1', filePath: 'voice/vc-1.webm', duration: 3, location: 'p1', createdAt: '2025-01-01T00:00:00Z' },
          { id: 'vc-2', filePath: 'voice/vc-2.webm', duration: 5, location: 'p2', createdAt: '2025-01-02T00:00:00Z' },
        ],
      }));

      await deleteVoiceComment(fs, 'test.epub', 'vc-1');

      const index = JSON.parse(fs.files.get('test.epub.reading/voice-comments.json')!);
      expect(index.comments).toHaveLength(1);
      expect(index.comments[0].id).toBe('vc-2');
    });

    it('does not throw when index does not exist', async () => {
      const fs = createMockFS();
      await expect(deleteVoiceComment(fs, 'test.epub', 'vc-1')).resolves.not.toThrow();
    });
  });
});
