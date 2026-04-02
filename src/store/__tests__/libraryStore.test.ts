/**
 * Tests for libraryStore (Zustand store).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';

// ---- Helpers ----

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    title: 'Test Book',
    authors: ['Author A'],
    tags: ['fiction'],
    formats: ['epub'],
    status: 'to-read',
    vaultPath: 'books/Test',
    notePath: 'books/Test/Test.md',
    filePaths: {} as any,
    ...overrides,
  };
}

// ---- Tests ----

describe('libraryStore', () => {
  beforeEach(() => {
    // Clear persisted state
    localStorage.clear();
    // Reset store to initial state
    useLibraryStore.setState({
      items: [],
      filter: {},
      sort: { field: 'title', direction: 'asc' },
      viewMode: 'grid',
      isLoading: false,
      error: null,
      theme: 'system',
    });
  });

  describe('items', () => {
    it('starts with empty items', () => {
      expect(useLibraryStore.getState().items).toEqual([]);
    });

    it('sets items', () => {
      const items = [makeItem({ title: 'A' }), makeItem({ title: 'B' })];
      useLibraryStore.getState().setItems(items);
      expect(useLibraryStore.getState().items).toHaveLength(2);
      expect(useLibraryStore.getState().items[0].title).toBe('A');
    });

    it('replaces items completely', () => {
      useLibraryStore.getState().setItems([makeItem()]);
      useLibraryStore.getState().setItems([makeItem(), makeItem(), makeItem()]);
      expect(useLibraryStore.getState().items).toHaveLength(3);
    });
  });

  describe('filters', () => {
    it('starts with empty filter', () => {
      expect(useLibraryStore.getState().filter).toEqual({});
    });

    it('sets partial filter (merges)', () => {
      useLibraryStore.getState().setFilter({ status: ['reading'] });
      useLibraryStore.getState().setFilter({ folders: ['Libros'] });
      const filter = useLibraryStore.getState().filter;
      expect(filter.status).toEqual(['reading']);
      expect(filter.folders).toEqual(['Libros']);
    });

    it('overwrites existing filter fields', () => {
      useLibraryStore.getState().setFilter({ search: 'test' });
      useLibraryStore.getState().setFilter({ search: 'updated' });
      expect(useLibraryStore.getState().filter.search).toBe('updated');
    });

    it('clears filters', () => {
      useLibraryStore.getState().setFilter({ folders: ['Libros'], search: 'x' });
      useLibraryStore.getState().clearFilters();
      expect(useLibraryStore.getState().filter).toEqual({});
    });
  });

  describe('sort', () => {
    it('defaults to title ascending', () => {
      const sort = useLibraryStore.getState().sort;
      expect(sort.field).toBe('title');
      expect(sort.direction).toBe('asc');
    });

    it('sets sort', () => {
      useLibraryStore.getState().setSort({ field: 'year', direction: 'desc' });
      const sort = useLibraryStore.getState().sort;
      expect(sort.field).toBe('year');
      expect(sort.direction).toBe('desc');
    });
  });

  describe('viewMode', () => {
    it('defaults to grid', () => {
      expect(useLibraryStore.getState().viewMode).toBe('grid');
    });

    it('sets view mode', () => {
      useLibraryStore.getState().setViewMode('list');
      expect(useLibraryStore.getState().viewMode).toBe('list');
    });
  });

  describe('loading and error', () => {
    it('sets loading', () => {
      useLibraryStore.getState().setLoading(true);
      expect(useLibraryStore.getState().isLoading).toBe(true);
    });

    it('sets error', () => {
      useLibraryStore.getState().setError('Something went wrong');
      expect(useLibraryStore.getState().error).toBe('Something went wrong');
    });

    it('clears error', () => {
      useLibraryStore.getState().setError('err');
      useLibraryStore.getState().setError(null);
      expect(useLibraryStore.getState().error).toBeNull();
    });
  });

  describe('theme', () => {
    it('defaults to system', () => {
      expect(useLibraryStore.getState().theme).toBe('system');
    });

    it('sets theme', () => {
      useLibraryStore.getState().setTheme('dark');
      expect(useLibraryStore.getState().theme).toBe('dark');
    });
  });

  describe('vaultConfig', () => {
    it('has default config', () => {
      const config = useLibraryStore.getState().vaultConfig;
      expect(config.folders).toHaveLength(7);
      expect(config.folders[0]).toEqual({ name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true });
      expect(config.folders[1]).toEqual({ name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true });
      expect(config.folders[2]).toEqual({ name: 'Autores', path: 'authors', showInMenu: true, showInLibrary: false });
    });

    it('updates config partially (merges)', () => {
      useLibraryStore.getState().setVaultConfig({ path: '/new/path' });
      const config = useLibraryStore.getState().vaultConfig;
      expect(config.path).toBe('/new/path');
      expect(config.folders).toHaveLength(7); // unchanged
    });

    it('updates folders list', () => {
      useLibraryStore.getState().setVaultConfig({
        folders: [{ name: 'Libros', path: 'libros', showInMenu: false, showInLibrary: true }],
      });
      const config = useLibraryStore.getState().vaultConfig;
      expect(config.folders).toHaveLength(1);
      expect(config.folders[0].path).toBe('libros');
    });
  });
});
