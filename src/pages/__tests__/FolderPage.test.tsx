/**
 * Smoke tests for FolderPage — folder-scoped item view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FolderPage } from '@/pages/FolderPage';
import { useLibraryStore } from '@/store/libraryStore';

// Mock hooks
const mockRequestAccess = vi.fn().mockResolvedValue(true);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useFileSystem', () => ({
  useFileSystem: vi.fn(() => ({
    fs: null,
    isReady: false,
    isRestoring: false,
    rootName: '',
    error: null,
    requestAccess: mockRequestAccess,
    disconnect: mockDisconnect,
  })),
}));

vi.mock('@/hooks/useVaultLoader', () => ({
  useVaultLoader: vi.fn(() => ({ loadVault: vi.fn() })),
}));

vi.mock('@/hooks/useFilteredItems', () => ({
  useFilteredItems: vi.fn(() => []),
}));

vi.mock('@/components/library/ItemGrid', () => ({
  ItemGrid: vi.fn(({ items, emptyMessage }: any) => (
    <div data-testid="item-grid">
      <span data-testid="item-count">{items.length}</span>
      {items.length === 0 && <p>{emptyMessage}</p>}
    </div>
  )),
}));

import { useFileSystem } from '@/hooks/useFileSystem';
import { useFilteredItems } from '@/hooks/useFilteredItems';

const mockUseFileSystem = vi.mocked(useFileSystem);
const mockUseFilteredItems = vi.mocked(useFilteredItems);

function fsMock(overrides: Record<string, unknown> = {}) {
  return {
    fs: null as any,
    isReady: false,
    isRestoring: false,
    rootName: '',
    error: null as string | null,
    requestAccess: mockRequestAccess,
    disconnect: mockDisconnect,
    ...overrides,
  };
}

function renderPage(slug: string = 'books') {
  return render(
    <MemoryRouter initialEntries={[`/folder/${slug}`]}>
      <Routes>
        <Route path="/folder/:slug" element={<FolderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useLibraryStore.setState({
    items: [],
    vaultConfig: {
      path: '/vault',
      folders: [
        { name: 'Libros', path: 'books', showInMenu: true, showInLibrary: true },
      ],
    },
    isLoading: false,
  });
  mockUseFileSystem.mockReturnValue(fsMock());
  mockUseFilteredItems.mockReturnValue([]);
});

describe('FolderPage', () => {
  // ---- Folder not found ----

  it('shows "Carpeta no encontrada" for unknown slug', () => {
    renderPage('nonexistent');
    expect(screen.getByText('Carpeta no encontrada')).toBeInTheDocument();
  });

  it('shows slug in not-found message', () => {
    renderPage('nonexistent');
    expect(screen.getByText(/nonexistent/)).toBeInTheDocument();
  });

  it('shows link to library in not-found state', () => {
    renderPage('nonexistent');
    const link = screen.getByText('Volver a la biblioteca');
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  // ---- Restoring state ----

  it('shows spinner when restoring', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ isRestoring: true }));
    renderPage('books');
    expect(screen.getByText('Reconectando al vault...')).toBeInTheDocument();
  });

  // ---- Not ready state ----

  it('shows folder name when not ready', () => {
    renderPage('books');
    expect(screen.getByText('Libros')).toBeInTheDocument();
  });

  it('shows connect prompt when not ready', () => {
    renderPage('books');
    expect(screen.getByText('Conecta un vault para ver el contenido.')).toBeInTheDocument();
  });

  // ---- Connected state ----

  it('shows folder name heading when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true }));
    renderPage('books');
    expect(screen.getByText('Libros')).toBeInTheDocument();
  });

  it('shows reload button when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true }));
    renderPage('books');
    expect(screen.getByText('Recargar')).toBeInTheDocument();
  });

  it('shows item count when items exist', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true }));
    useLibraryStore.setState({
      items: [
        { id: '1', folder: 'Libros' },
        { id: '2', folder: 'Libros' },
        { id: '3', folder: 'Comics' },
      ] as any[],
      vaultConfig: {
        path: '/vault',
        folders: [
          { name: 'Libros', path: 'books', showInMenu: true, showInLibrary: true },
        ],
      },
    });
    renderPage('books');
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('renders ItemGrid when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true }));
    renderPage('books');
    expect(screen.getByTestId('item-grid')).toBeInTheDocument();
  });

  it('shows "Cargando..." when loading', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true }));
    useLibraryStore.setState({ isLoading: true });
    renderPage('books');
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });
});
