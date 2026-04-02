/**
 * Tests for useReaderStorage utilities:
 * - getStorageKey: key generation with/without prefix
 * - loadFromStorage: JSON parse with fallback
 * - saveToStorage: JSON stringify to localStorage
 * - formatDuration: seconds to m:ss string
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStorageKey,
  loadFromStorage,
  saveToStorage,
  formatDuration,
} from '../useReaderStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('getStorageKey', () => {
  it('generates key with prefix', () => {
    expect(getStorageKey('comic', 'path/to/file.cbz', 'settings')).toBe(
      'libreader:comic:path/to/file.cbz:settings',
    );
  });

  it('generates key with pdf prefix', () => {
    expect(getStorageKey('pdf', 'docs/paper.pdf', 'position')).toBe(
      'libreader:pdf:docs/paper.pdf:position',
    );
  });

  it('generates legacy key without prefix (EPUB)', () => {
    expect(getStorageKey('', 'books/novel.epub', 'position')).toBe(
      'libreader:books/novel.epub:position',
    );
  });

  it('handles empty file path', () => {
    expect(getStorageKey('comic', '', 'settings')).toBe(
      'libreader:comic::settings',
    );
  });
});

describe('loadFromStorage', () => {
  it('returns fallback when key does not exist', () => {
    expect(loadFromStorage('nonexistent', 42)).toBe(42);
  });

  it('returns parsed value when key exists', () => {
    localStorage.setItem('test-key', JSON.stringify({ page: 5 }));
    expect(loadFromStorage('test-key', {})).toEqual({ page: 5 });
  });

  it('returns fallback for invalid JSON', () => {
    localStorage.setItem('bad-json', 'not valid json{');
    expect(loadFromStorage('bad-json', 'default')).toBe('default');
  });

  it('returns parsed array', () => {
    localStorage.setItem('arr-key', JSON.stringify([1, 2, 3]));
    expect(loadFromStorage<number[]>('arr-key', [])).toEqual([1, 2, 3]);
  });

  it('returns parsed string', () => {
    localStorage.setItem('str-key', JSON.stringify('hello'));
    expect(loadFromStorage('str-key', '')).toBe('hello');
  });

  it('returns parsed null (not fallback)', () => {
    localStorage.setItem('null-key', 'null');
    expect(loadFromStorage('null-key', 'fallback')).toBeNull();
  });

  it('returns parsed false (not fallback)', () => {
    localStorage.setItem('false-key', 'false');
    expect(loadFromStorage('false-key', true)).toBe(false);
  });
});

describe('saveToStorage', () => {
  it('saves object as JSON', () => {
    saveToStorage('obj-key', { page: 10 });
    expect(localStorage.getItem('obj-key')).toBe('{"page":10}');
  });

  it('saves array as JSON', () => {
    saveToStorage('arr-key', [1, 2, 3]);
    expect(localStorage.getItem('arr-key')).toBe('[1,2,3]');
  });

  it('saves string as JSON', () => {
    saveToStorage('str-key', 'hello');
    expect(localStorage.getItem('str-key')).toBe('"hello"');
  });

  it('saves number as JSON', () => {
    saveToStorage('num-key', 42);
    expect(localStorage.getItem('num-key')).toBe('42');
  });

  it('overwrites existing value', () => {
    saveToStorage('key', 'first');
    saveToStorage('key', 'second');
    expect(localStorage.getItem('key')).toBe('"second"');
  });
});

describe('formatDuration', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats single-digit seconds with padding', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats double-digit seconds', () => {
    expect(formatDuration(30)).toBe('0:30');
  });

  it('formats 59 seconds', () => {
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats exactly 1 minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('formats 1 minute and 5 seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('formats 10 minutes', () => {
    expect(formatDuration(600)).toBe('10:00');
  });

  it('formats 99 minutes', () => {
    expect(formatDuration(5999)).toBe('99:59');
  });

  it('formats large values (100+ minutes)', () => {
    expect(formatDuration(6000)).toBe('100:00');
  });
});
