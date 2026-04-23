import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LibraryItem,
  LibraryFilter,
  LibrarySort,
  ViewMode,
  VaultConfig,
} from '@/types';
import type { AnnotationCategory } from '@/types/annotation';

export type AIProviderType = 'openai' | 'anthropic' | 'github' | 'ollama';

export interface AIProviderConfig {
  type: AIProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string; // Custom endpoint (Ollama, Azure, etc.)
}

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
  theme: 'light' | 'dark' | 'system' | 'eink';

  // Annotation categories
  annotationCategories: AnnotationCategory[];

  // Search highlight color (hex)
  searchHighlightColor: string;

  // AI config
  aiProvider: AIProviderConfig | null;

  // Actions
  setItems: (items: LibraryItem[]) => void;
  setFilter: (filter: Partial<LibraryFilter>) => void;
  clearFilters: () => void;
  setSort: (sort: LibrarySort) => void;
  setViewMode: (mode: ViewMode) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setVaultConfig: (config: Partial<VaultConfig>) => void;
  setTheme: (theme: 'light' | 'dark' | 'system' | 'eink') => void;
  setSearchHighlightColor: (color: string) => void;
  setAIProvider: (provider: AIProviderConfig | null) => void;

  // Category CRUD
  addCategory: (category: AnnotationCategory) => void;
  updateCategory: (id: string, updates: Partial<Omit<AnnotationCategory, 'id'>>) => void;
  removeCategory: (id: string) => void;
  reorderCategories: (categories: AnnotationCategory[]) => void;
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

      // Annotation categories
      annotationCategories: [],

      // Search highlight color — bright orange by default
      searchHighlightColor: '#ff6b00',

      // AI
      aiProvider: null,

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
      setSearchHighlightColor: (color) => set({ searchHighlightColor: color }),
      setAIProvider: (provider) => set({ aiProvider: provider }),

      // Category CRUD
      addCategory: (category) =>
        set((state) => ({
          annotationCategories: [...state.annotationCategories, category],
        })),
      updateCategory: (id, updates) =>
        set((state) => ({
          annotationCategories: state.annotationCategories.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        })),
      removeCategory: (id) =>
        set((state) => ({
          annotationCategories: state.annotationCategories.filter((c) => c.id !== id),
        })),
      reorderCategories: (categories) =>
        set({ annotationCategories: categories }),
    }),
    {
      name: 'libreader-storage',
      partialize: (state) => ({
        vaultConfig: state.vaultConfig,
        theme: state.theme,
        viewMode: state.viewMode,
        sort: state.sort,
        annotationCategories: state.annotationCategories,
        searchHighlightColor: state.searchHighlightColor,
        aiProvider: state.aiProvider,
      }),
    }
  )
);

// Expose store for e2e testing
if (import.meta.env.DEV) {
  (window as any).__ZUSTAND_STORE__ = useLibraryStore;
}
