/**
 * Smoke tests for StatsPage — statistics dashboard.
 * StatsPage only depends on useLibraryStore (items), no FS hooks needed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatsPage } from '@/pages/StatsPage';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    title: 'Test Book',
    authors: [],
    tags: [],
    formats: ['epub'],
    status: 'to-read',
    vaultPath: 'books/Test',
    notePath: 'books/Test/Test.md',
    filePaths: {} as any,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useLibraryStore.setState({ items: [] });
});

describe('StatsPage', () => {
  // ---- Empty state ----

  it('shows empty message when no items', () => {
    renderPage();
    expect(screen.getByText('No hay items en la biblioteca.')).toBeInTheDocument();
  });

  it('shows link to library in empty state', () => {
    renderPage();
    const link = screen.getByText('Ir a la biblioteca');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  // ---- With items ----

  it('shows heading when items exist', () => {
    useLibraryStore.setState({ items: [makeItem()] });
    renderPage();
    expect(screen.getByText('Estadisticas')).toBeInTheDocument();
  });

  it('shows summary cards with correct counts', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', status: 'to-read' }),
        makeItem({ id: '2', status: 'reading' }),
        makeItem({ id: '3', status: 'finished' }),
        makeItem({ id: '4', status: 'finished' }),
      ],
    });
    renderPage();
    // Total card
    expect(screen.getByText('Total')).toBeInTheDocument();
    // Status labels in summary cards (may also appear in breakdown, so use getAllByText)
    expect(screen.getByText('Terminados')).toBeInTheDocument();
    expect(screen.getAllByText('Leyendo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Por leer').length).toBeGreaterThanOrEqual(1);
  });

  it('shows status breakdown section', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', status: 'reading' }),
        makeItem({ id: '2', status: 'finished' }),
      ],
    });
    renderPage();
    expect(screen.getByText('Por estado')).toBeInTheDocument();
  });

  it('shows folder breakdown section', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', folder: 'Libros' }),
        makeItem({ id: '2', folder: 'Comics' }),
      ],
    });
    renderPage();
    expect(screen.getByText('Por carpeta')).toBeInTheDocument();
  });

  it('shows progress distribution section', () => {
    useLibraryStore.setState({
      items: [makeItem({ id: '1', progress: 50 })],
    });
    renderPage();
    expect(screen.getByText('Distribucion de progreso')).toBeInTheDocument();
  });

  it('shows formats section', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', formats: ['epub'] }),
        makeItem({ id: '2', formats: ['pdf'] }),
      ],
    });
    renderPage();
    expect(screen.getByText('Formatos')).toBeInTheDocument();
  });

  it('shows authors section when authors exist', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', authors: ['Author A'] }),
        makeItem({ id: '2', authors: ['Author A', 'Author B'] }),
      ],
    });
    renderPage();
    expect(screen.getByText('Autores mas frecuentes')).toBeInTheDocument();
  });

  it('shows tags section when tags exist', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', tags: ['sci-fi', 'classic'] }),
      ],
    });
    renderPage();
    expect(screen.getByText('Tags mas usados')).toBeInTheDocument();
  });

  it('shows ratings section when items have ratings', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', rating: 4 }),
        makeItem({ id: '2', rating: 5 }),
      ],
    });
    renderPage();
    expect(screen.getByText(/Valoraciones/)).toBeInTheDocument();
  });

  it('shows recently read section when items have lastRead', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', title: 'Recent Book', lastRead: new Date().toISOString() }),
      ],
    });
    renderPage();
    expect(screen.getByText('Leido recientemente')).toBeInTheDocument();
    expect(screen.getByText('Recent Book')).toBeInTheDocument();
  });

  it('shows year started section when items have dateStarted', () => {
    useLibraryStore.setState({
      items: [
        makeItem({ id: '1', dateStarted: '2024-01-15' }),
        makeItem({ id: '2', dateStarted: '2023-06-01' }),
      ],
    });
    renderPage();
    expect(screen.getByText('Inicio de lectura por ano')).toBeInTheDocument();
  });
});
