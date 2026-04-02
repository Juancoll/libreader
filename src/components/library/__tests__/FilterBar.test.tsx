/**
 * Tests for FilterBar component.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '@/components/library/FilterBar';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';

// ---- Helpers ----

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    title: 'Test',
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
  makeItem({ status: 'reading', tags: ['fiction'], folder: 'Libros' }),
  makeItem({ status: 'finished', tags: ['fiction', 'history'], folder: 'Libros' }),
  makeItem({ status: 'to-read', tags: ['sci-fi'], folder: 'Comics' }),
  makeItem({ status: 'abandoned', tags: ['philosophy'], folder: 'Otros' }),
];

// ---- Tests ----

describe('FilterBar', () => {
  beforeEach(() => {
    localStorage.clear();
    useLibraryStore.setState({
      items: testItems,
      filter: {},
      sort: { field: 'title', direction: 'asc' },
      viewMode: 'grid',
      vaultConfig: {
        path: '',
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Otros', path: 'others', showInMenu: false, showInLibrary: true },
        ],
      },
    });
  });

  it('renders search input', () => {
    render(<FilterBar />);
    expect(screen.getByPlaceholderText(/Buscar/)).toBeInTheDocument();
  });

  it('renders folder filter chips with counts', () => {
    render(<FilterBar />);
    expect(screen.getByText('Libros (2)')).toBeInTheDocument();
    expect(screen.getByText('Comics (1)')).toBeInTheDocument();
    expect(screen.getByText('Otros (1)')).toBeInTheDocument();
  });

  it('does not render folder chips for folders with 0 items', () => {
    useLibraryStore.setState({
      vaultConfig: {
        path: '',
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Otros', path: 'others', showInMenu: false, showInLibrary: true },
          { name: 'Papers', path: 'papers', showInMenu: false, showInLibrary: true },
        ],
      },
    });
    render(<FilterBar />);
    expect(screen.queryByText(/Papers/)).not.toBeInTheDocument();
  });

  it('renders status filter chips with counts', () => {
    render(<FilterBar />);
    expect(screen.getByText('Por leer (1)')).toBeInTheDocument();
    expect(screen.getByText('Leyendo (1)')).toBeInTheDocument();
    expect(screen.getByText('Terminado (1)')).toBeInTheDocument();
    expect(screen.getByText('Abandonado (1)')).toBeInTheDocument();
  });

  it('shows tags section', () => {
    render(<FilterBar />);
    expect(screen.getByText(/Tags \(4\)/)).toBeInTheDocument();
  });

  it('toggles folder filter on click', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    await user.click(screen.getByText('Libros (2)'));
    expect(useLibraryStore.getState().filter.folders).toEqual(['Libros']);
    
    // Click again to deselect
    await user.click(screen.getByText('Libros (2)'));
    expect(useLibraryStore.getState().filter.folders).toBeUndefined();
  });

  it('toggles status filter on click', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    await user.click(screen.getByText('Leyendo (1)'));
    expect(useLibraryStore.getState().filter.status).toEqual(['reading']);
  });

  it('updates search on input (debounced)', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    const input = screen.getByPlaceholderText(/Buscar/);
    await user.type(input, 'quijote');
    await waitFor(() => {
      expect(useLibraryStore.getState().filter.search).toBe('quijote');
    });
  });

  it('shows "Limpiar filtros" button when filters are active', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    // No clear button initially
    expect(screen.queryByText('Limpiar filtros')).not.toBeInTheDocument();
    
    // Set a filter
    await user.click(screen.getByText('Libros (2)'));
    
    // Clear button should appear
    expect(screen.getByText('Limpiar filtros')).toBeInTheDocument();
  });

  it('clears all filters when "Limpiar filtros" is clicked', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    // Set filters
    await user.click(screen.getByText('Libros (2)'));
    await user.click(screen.getByText('Limpiar filtros'));
    
    expect(useLibraryStore.getState().filter).toEqual({});
  });

  it('renders sort dropdown', () => {
    render(<FilterBar />);
    const select = screen.getByDisplayValue('Titulo A-Z');
    expect(select).toBeInTheDocument();
  });

  it('changes sort on dropdown selection', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    const select = screen.getByDisplayValue('Titulo A-Z');
    await user.selectOptions(select, 'year-desc');
    
    const sort = useLibraryStore.getState().sort;
    expect(sort.field).toBe('year');
    expect(sort.direction).toBe('desc');
  });

  it('renders view mode toggle buttons', () => {
    render(<FilterBar />);
    expect(screen.getByTitle('Grid')).toBeInTheDocument();
    expect(screen.getByTitle('List')).toBeInTheDocument();
  });

  it('toggles view mode', async () => {
    const user = userEvent.setup();
    render(<FilterBar />);
    
    await user.click(screen.getByTitle('List'));
    expect(useLibraryStore.getState().viewMode).toBe('list');
    
    await user.click(screen.getByTitle('Grid'));
    expect(useLibraryStore.getState().viewMode).toBe('grid');
  });
});
