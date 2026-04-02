/**
 * Tests for useFilteredItems hook.
 * Tests filtering and sorting logic against the store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredItems } from '@/hooks/useFilteredItems';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';

// ---- Helpers ----

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    title: 'Untitled',
    authors: [],
    tags: [],
    formats: ['epub'],
    status: 'to-read',
    vaultPath: 'test',
    notePath: 'test.md',
    filePaths: {} as any,
    ...overrides,
  };
}

const testItems: LibraryItem[] = [
  makeItem({ id: '1', title: 'Alpha', status: 'reading', authors: ['Author A'], tags: ['fiction'], year: '2020', rating: 4, progress: 50, language: 'es', formats: ['epub'], folder: 'Libros' }),
  makeItem({ id: '2', title: 'Beta', status: 'finished', authors: ['Author B'], tags: ['sci-fi'], year: '2021', rating: 5, progress: 100, language: 'en', formats: ['cbz'], folder: 'Comics' }),
  makeItem({ id: '3', title: 'Gamma', status: 'to-read', authors: ['Author A', 'Author C'], tags: ['fiction', 'history'], year: '2019', rating: 3, progress: 0, language: 'es', formats: ['pdf'], folder: 'Libros' }),
  makeItem({ id: '4', title: 'Delta', status: 'abandoned', authors: ['Author D'], tags: ['philosophy'], year: '2022', rating: 2, progress: 25, language: 'fr', formats: ['epub', 'pdf'], folder: 'Otros' }),
  makeItem({ id: '5', title: 'Epsilon', status: 'reading', authors: ['Author B'], tags: ['sci-fi', 'action'], year: '2023', rating: 4, progress: 75, language: 'en', formats: ['cbr'], folder: 'Comics' }),
  makeItem({ id: '6', title: 'Cervantes', status: 'to-read', authors: [], tags: ['clasico'], year: '1547', rating: 0, progress: 0, language: 'es', formats: ['md'], folder: 'Autores' }),
];

// ---- Tests ----

describe('useFilteredItems', () => {
  beforeEach(() => {
    const store = useLibraryStore.getState();
    store.setItems(testItems);
    store.clearFilters();
    store.setSort({ field: 'title', direction: 'asc' });
    store.setVaultConfig({
      folders: [
        { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
        { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
        { name: 'Autores', path: 'authors', showInMenu: true, showInLibrary: false },
        { name: 'Otros', path: 'others', showInMenu: false, showInLibrary: true },
      ],
    });
  });

  it('returns all items when no filters applied', () => {
    const { result } = renderHook(() => useFilteredItems());
    expect(result.current).toHaveLength(6);
  });

  it('sorts by title ascending by default', () => {
    const { result } = renderHook(() => useFilteredItems());
    const titles = result.current.map((i) => i.title);
    expect(titles).toEqual(['Alpha', 'Beta', 'Cervantes', 'Delta', 'Epsilon', 'Gamma']);
  });

  it('sorts by title descending', () => {
    useLibraryStore.getState().setSort({ field: 'title', direction: 'desc' });
    const { result } = renderHook(() => useFilteredItems());
    const titles = result.current.map((i) => i.title);
    expect(titles).toEqual(['Gamma', 'Epsilon', 'Delta', 'Cervantes', 'Beta', 'Alpha']);
  });

  it('sorts by year', () => {
    useLibraryStore.getState().setSort({ field: 'year', direction: 'asc' });
    const { result } = renderHook(() => useFilteredItems());
    const years = result.current.map((i) => i.year);
    expect(years).toEqual(['1547', '2019', '2020', '2021', '2022', '2023']);
  });

  it('sorts by rating descending', () => {
    useLibraryStore.getState().setSort({ field: 'rating', direction: 'desc' });
    const { result } = renderHook(() => useFilteredItems());
    expect(result.current[0].rating).toBe(5);
    expect(result.current[result.current.length - 1].rating).toBe(0);
  });

  it('sorts by progress', () => {
    useLibraryStore.getState().setSort({ field: 'progress', direction: 'asc' });
    const { result } = renderHook(() => useFilteredItems());
    const progs = result.current.map((i) => i.progress);
    expect(progs).toEqual([0, 0, 25, 50, 75, 100]);
  });

  describe('folder filter', () => {
    it('filters by single folder', () => {
      useLibraryStore.getState().setFilter({ folders: ['Libros'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2);
      expect(result.current.every((i) => i.folder === 'Libros')).toBe(true);
    });

    it('filters by multiple folders', () => {
      useLibraryStore.getState().setFilter({ folders: ['Libros', 'Comics'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(4);
    });
  });

  describe('status filter', () => {
    it('filters by status', () => {
      useLibraryStore.getState().setFilter({ status: ['reading'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2);
      expect(result.current.every((i) => i.status === 'reading')).toBe(true);
    });

    it('filters by multiple statuses', () => {
      useLibraryStore.getState().setFilter({ status: ['reading', 'finished'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(3);
    });
  });

  describe('tag filter', () => {
    it('filters by tag', () => {
      useLibraryStore.getState().setFilter({ tags: ['fiction'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2);
    });

    it('filters by multiple tags (OR)', () => {
      useLibraryStore.getState().setFilter({ tags: ['fiction', 'philosophy'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(3);
    });
  });

  describe('author filter', () => {
    it('filters by author', () => {
      useLibraryStore.getState().setFilter({ authors: ['Author B'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2);
    });

    it('matches items with multiple authors', () => {
      useLibraryStore.getState().setFilter({ authors: ['Author C'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Gamma');
    });
  });

  describe('format filter', () => {
    it('filters by format', () => {
      useLibraryStore.getState().setFilter({ formats: ['epub'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2); // Alpha + Delta
    });

    it('filters by cbz format', () => {
      useLibraryStore.getState().setFilter({ formats: ['cbz'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Beta');
    });
  });

  describe('language filter', () => {
    it('filters by language', () => {
      useLibraryStore.getState().setFilter({ language: 'es' });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(3);
    });
  });

  describe('search filter', () => {
    it('searches in title', () => {
      useLibraryStore.getState().setFilter({ search: 'alpha' });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Alpha');
    });

    it('search is case insensitive', () => {
      useLibraryStore.getState().setFilter({ search: 'BETA' });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(1);
    });

    it('searches in authors', () => {
      useLibraryStore.getState().setFilter({ search: 'author d' });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Delta');
    });

    it('searches in tags', () => {
      useLibraryStore.getState().setFilter({ search: 'sci-fi' });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2);
    });
  });

  describe('combined filters', () => {
    it('applies folder + status filters together', () => {
      useLibraryStore.getState().setFilter({ folders: ['Libros'], status: ['reading'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Alpha');
    });

    it('applies search + folder filters together', () => {
      useLibraryStore.getState().setFilter({ search: 'author b', folders: ['Comics'] });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(2);
    });

    it('empty result when filters are contradictory', () => {
      useLibraryStore.getState().setFilter({ folders: ['Comics'], language: 'fr' });
      const { result } = renderHook(() => useFilteredItems());
      expect(result.current).toHaveLength(0);
    });
  });

  describe('libraryOnly option', () => {
    it('only returns items from showInLibrary folders', () => {
      const { result } = renderHook(() => useFilteredItems({ libraryOnly: true }));
      // Autores folder has showInLibrary=false, so Cervantes should be excluded
      expect(result.current).toHaveLength(5);
      expect(result.current.every((i) => i.folder !== 'Autores')).toBe(true);
    });

    it('treats undefined showInLibrary as true (includes in library)', () => {
      // Simulate persisted state from before showInLibrary was added
      useLibraryStore.getState().setVaultConfig({
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false } as any,
          { name: 'Comics', path: 'comics', showInMenu: false } as any,
          { name: 'Autores', path: 'authors', showInMenu: true, showInLibrary: false },
          { name: 'Otros', path: 'others', showInMenu: false } as any,
        ],
      });
      const { result } = renderHook(() => useFilteredItems({ libraryOnly: true }));
      // Libros, Comics, Otros have undefined showInLibrary → treated as true
      // Autores has showInLibrary=false → excluded
      expect(result.current).toHaveLength(5);
      expect(result.current.every((i) => i.folder !== 'Autores')).toBe(true);
    });

    it('returns all items when libraryOnly is false', () => {
      const { result } = renderHook(() => useFilteredItems({ libraryOnly: false }));
      expect(result.current).toHaveLength(6);
    });

    it('applies other filters together with libraryOnly', () => {
      useLibraryStore.getState().setFilter({ folders: ['Libros'] });
      const { result } = renderHook(() => useFilteredItems({ libraryOnly: true }));
      expect(result.current).toHaveLength(2);
      expect(result.current.every((i) => i.folder === 'Libros')).toBe(true);
    });
  });

  describe('folderName option', () => {
    it('only returns items from the specified folder', () => {
      const { result } = renderHook(() => useFilteredItems({ folderName: 'Comics' }));
      expect(result.current).toHaveLength(2);
      expect(result.current.every((i) => i.folder === 'Comics')).toBe(true);
    });

    it('returns items from Autores folder', () => {
      const { result } = renderHook(() => useFilteredItems({ folderName: 'Autores' }));
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Cervantes');
    });

    it('returns empty for non-existent folder', () => {
      const { result } = renderHook(() => useFilteredItems({ folderName: 'NonExistent' }));
      expect(result.current).toHaveLength(0);
    });

    it('applies search filter within folder', () => {
      useLibraryStore.getState().setFilter({ search: 'alpha' });
      const { result } = renderHook(() => useFilteredItems({ folderName: 'Libros' }));
      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe('Alpha');
    });
  });
});
