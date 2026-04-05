/**
 * Smoke tests for SettingsPage — vault config, folders, theme, about.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '@/pages/SettingsPage';
import { useLibraryStore } from '@/store/libraryStore';

// Mock hooks that depend on browser APIs
const mockRequestAccess = vi.fn().mockResolvedValue(true);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSetNativeVaultPath = vi.fn().mockResolvedValue(false);
const mockGetNativeVaultPath = vi.fn().mockReturnValue('');

vi.mock('@/hooks/useFileSystem', () => ({
  useFileSystem: vi.fn(() => ({
    fs: null,
    isReady: false,
    isRestoring: false,
    rootName: '',
    error: null,
    isNative: false,
    requestAccess: mockRequestAccess,
    disconnect: mockDisconnect,
    setNativeVaultPath: mockSetNativeVaultPath,
    getNativeVaultPath: mockGetNativeVaultPath,
  })),
}));

vi.mock('@/hooks/useVaultLoader', () => ({
  useVaultLoader: vi.fn(() => ({ loadVault: vi.fn() })),
}));

vi.mock('@/services/vaultCache', () => ({
  clearVaultCache: vi.fn().mockResolvedValue(undefined),
}));

import { useFileSystem } from '@/hooks/useFileSystem';
const mockUseFileSystem = vi.mocked(useFileSystem);

function renderPage() {
  return render(<SettingsPage />);
}

beforeEach(() => {
  useLibraryStore.setState({
    items: [],
    vaultConfig: { path: '', folders: [] },
    theme: 'system',
  });
  mockUseFileSystem.mockReturnValue({
    fs: null as any,
    isReady: false,
    isRestoring: false,
    rootName: '',
    error: null,
    isNative: false,
    requestAccess: mockRequestAccess,
    disconnect: mockDisconnect,
    setNativeVaultPath: mockSetNativeVaultPath,
    getNativeVaultPath: mockGetNativeVaultPath,
  });
});

describe('SettingsPage', () => {
  // ---- Structure ----

  it('renders heading', () => {
    renderPage();
    expect(screen.getByText('Ajustes')).toBeInTheDocument();
  });

  it('renders all section headings', () => {
    renderPage();
    expect(screen.getByText('Vault de Obsidian')).toBeInTheDocument();
    expect(screen.getByText('Carpetas del Vault')).toBeInTheDocument();
    expect(screen.getByText('Apariencia')).toBeInTheDocument();
    expect(screen.getByText('Acerca de')).toBeInTheDocument();
  });

  it('renders version text', () => {
    renderPage();
    expect(screen.getByText(/LibReader v0\.1\.0/)).toBeInTheDocument();
  });

  // ---- Disconnected state ----

  it('shows "Desconectado" when not ready', () => {
    renderPage();
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
  });

  it('shows "Conectar vault" button when disconnected', () => {
    renderPage();
    expect(screen.getByText('Conectar vault')).toBeInTheDocument();
  });

  // ---- Connected state ----

  it('shows "Conectado" when ready', () => {
    mockUseFileSystem.mockReturnValue({
      fs: {} as any,
      isReady: true,
      isRestoring: false,
      rootName: 'my-vault',
      error: null,
      isNative: false,
      requestAccess: mockRequestAccess,
      disconnect: mockDisconnect,
      setNativeVaultPath: mockSetNativeVaultPath,
      getNativeVaultPath: mockGetNativeVaultPath,
    });
    renderPage();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('shows rootName when connected', () => {
    mockUseFileSystem.mockReturnValue({
      fs: {} as any,
      isReady: true,
      isRestoring: false,
      rootName: 'my-vault',
      error: null,
      isNative: false,
      requestAccess: mockRequestAccess,
      disconnect: mockDisconnect,
      setNativeVaultPath: mockSetNativeVaultPath,
      getNativeVaultPath: mockGetNativeVaultPath,
    });
    renderPage();
    expect(screen.getByText('my-vault')).toBeInTheDocument();
  });

  it('shows "Cambiar vault" and "Desconectar" when connected', () => {
    mockUseFileSystem.mockReturnValue({
      fs: {} as any,
      isReady: true,
      isRestoring: false,
      rootName: 'my-vault',
      error: null,
      isNative: false,
      requestAccess: mockRequestAccess,
      disconnect: mockDisconnect,
      setNativeVaultPath: mockSetNativeVaultPath,
      getNativeVaultPath: mockGetNativeVaultPath,
    });
    renderPage();
    expect(screen.getByText('Cambiar vault')).toBeInTheDocument();
    expect(screen.getByText('Desconectar')).toBeInTheDocument();
  });

  it('shows items count', () => {
    useLibraryStore.setState({ items: [{ id: '1' }, { id: '2' }] as any[] });
    renderPage();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ---- Folder config ----

  it('shows empty folder message when no folders', () => {
    renderPage();
    expect(screen.getByText(/No hay carpetas configuradas/)).toBeInTheDocument();
  });

  it('renders existing folders with inputs', () => {
    useLibraryStore.setState({
      vaultConfig: {
        path: '/vault',
        folders: [
          { name: 'Libros', path: 'books', showInMenu: true, showInLibrary: true },
        ],
      },
    });
    renderPage();
    const nameInput = screen.getByDisplayValue('Libros');
    expect(nameInput).toBeInTheDocument();
    const pathInput = screen.getByDisplayValue('books');
    expect(pathInput).toBeInTheDocument();
  });

  it('shows "+ Agregar" button', () => {
    renderPage();
    const buttons = screen.getAllByText('+ Agregar');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]).toBeInTheDocument();
  });

  it('adds a folder when "+ Agregar" is clicked', () => {
    renderPage();
    const buttons = screen.getAllByText('+ Agregar');
    fireEvent.click(buttons[0]); // First one is the folders button
    // Now there should be input fields for the new folder
    const nameInputs = screen.getAllByPlaceholderText('Nombre');
    expect(nameInputs.length).toBe(1);
  });

  it('shows delete button for each folder', () => {
    useLibraryStore.setState({
      vaultConfig: {
        path: '/vault',
        folders: [
          { name: 'Libros', path: 'books', showInMenu: true, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
        ],
      },
    });
    renderPage();
    const deleteButtons = screen.getAllByTitle('Eliminar carpeta');
    expect(deleteButtons.length).toBe(2);
  });

  // ---- Theme ----

  it('renders theme buttons', () => {
    renderPage();
    expect(screen.getByText('Claro')).toBeInTheDocument();
    expect(screen.getByText('Oscuro')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
  });

  it('changes theme on button click', () => {
    renderPage();
    fireEvent.click(screen.getByText('Oscuro'));
    expect(useLibraryStore.getState().theme).toBe('dark');
  });
});
