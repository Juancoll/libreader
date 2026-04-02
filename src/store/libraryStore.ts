import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LibraryItem,
  LibraryFilter,
  LibrarySort,
  ViewMode,
  VaultConfig,
} from '@/types';

interface LibraryState {
  // Data
  items: LibraryItem[];

  // UI State
  filter: LibraryFilter;
  sort: LibrarySort;
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;

  // Config
  vaultConfig: VaultConfig;
  theme: 'light' | 'dark' | 'system';

  // Actions
  setItems: (items: LibraryItem[]) => void;
  setFilter: (filter: Partial<LibraryFilter>) => void;
  clearFilters: () => void;
  setSort: (sort: LibrarySort) => void;
  setViewMode: (mode: ViewMode) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setVaultConfig: (config: Partial<VaultConfig>) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

const defaultVaultConfig: VaultConfig = {
  path: '~/OneDrive/resources/library',
  folders: [
    { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
    { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
    { name: 'Autores', path: 'authors', showInMenu: true, showInLibrary: false },
    { name: 'Papers', path: 'papers', showInMenu: false, showInLibrary: true },
    { name: 'Cursos', path: 'courses', showInMenu: false, showInLibrary: true },
    { name: 'Peliculas', path: 'movies', showInMenu: false, showInLibrary: true },
    { name: 'Otros', path: 'others', showInMenu: false, showInLibrary: true },
  ],
};

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      // Initial data
      items: [],

      // Initial UI state
      filter: {},
      sort: { field: 'title', direction: 'asc' },
      viewMode: 'grid',
      isLoading: false,
      error: null,

      // Config
      vaultConfig: defaultVaultConfig,
      theme: 'system',

      // Actions
      setItems: (items) => set({ items }),
      setFilter: (filter) =>
        set((state) => ({ filter: { ...state.filter, ...filter } })),
      clearFilters: () => set({ filter: {} }),
      setSort: (sort) => set({ sort }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setVaultConfig: (config) =>
        set((state) => ({
          vaultConfig: { ...state.vaultConfig, ...config },
        })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'libreader-storage',
      partialize: (state) => ({
        vaultConfig: state.vaultConfig,
        theme: state.theme,
        viewMode: state.viewMode,
        sort: state.sort,
      }),
    }
  )
);

// Expose store for e2e testing
if (import.meta.env.DEV) {
  (window as any).__ZUSTAND_STORE__ = useLibraryStore;
}
