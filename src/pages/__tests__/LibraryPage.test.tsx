/**
 * Smoke tests for LibraryPage — welcome screen, restoring, connected states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibraryPage } from '@/pages/LibraryPage';
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
  ItemGrid: vi.fn(({ items, emptyMessage, children }: any) => (
    <div data-testid="item-grid">
      <span data-testid="item-count">{items.length}</span>
      {items.length === 0 && <p>{emptyMessage}</p>}
      {children}
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

function renderPage() {
  return render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useLibraryStore.setState({
    items: [],
    vaultConfig: { path: '', folders: [] },
    isLoading: false,
  });
  mockUseFileSystem.mockReturnValue(fsMock());
  mockUseFilteredItems.mockReturnValue([]);
});

describe('LibraryPage', () => {
  // ---- Restoring state ----

  it('shows spinner when restoring vault connection', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ isRestoring: true }));
    renderPage();
    expect(screen.getByText('Reconectando al vault...')).toBeInTheDocument();
  });

  // ---- Welcome state (not ready) ----

  it('shows welcome heading when not connected', () => {
    renderPage();
    expect(screen.getByText('Bienvenido a LibReader')).toBeInTheDocument();
  });

  it('shows open vault button when not connected', () => {
    renderPage();
    expect(screen.getByText('Abrir Vault de Obsidian')).toBeInTheDocument();
  });

  it('shows privacy note when not connected', () => {
    renderPage();
    expect(screen.getByText(/No se sube nada a ningun servidor/)).toBeInTheDocument();
  });

  it('shows error message when filesystem has error', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ error: 'Permission denied' }));
    renderPage();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();
  });

  // ---- Connected state ----

  it('shows "Biblioteca" heading when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true, rootName: 'my-vault' }));
    renderPage();
    expect(screen.getByText('Biblioteca')).toBeInTheDocument();
  });

  it('shows rootName when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true, rootName: 'library' }));
    renderPage();
    expect(screen.getByText('library')).toBeInTheDocument();
  });

  it('shows reload button when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true, rootName: 'my-vault' }));
    renderPage();
    expect(screen.getByText('Recargar')).toBeInTheDocument();
  });

  it('shows "Cargando..." when loading', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true, rootName: 'my-vault' }));
    useLibraryStore.setState({ isLoading: true });
    renderPage();
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('renders ItemGrid when connected', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true, rootName: 'my-vault' }));
    renderPage();
    expect(screen.getByTestId('item-grid')).toBeInTheDocument();
  });

  it('shows item count text when items exist', () => {
    mockUseFileSystem.mockReturnValue(fsMock({ fs: {}, isReady: true, rootName: 'my-vault' }));
    useLibraryStore.setState({
      items: [
        { id: '1', folder: 'Libros' },
        { id: '2', folder: 'Libros' },
      ] as any[],
      vaultConfig: {
        path: '/vault',
        folders: [{ name: 'Libros', path: 'books', showInMenu: true, showInLibrary: true }],
      },
    });
    renderPage();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });
});
