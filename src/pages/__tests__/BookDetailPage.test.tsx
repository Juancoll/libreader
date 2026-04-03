/**
 * Smoke tests for BookDetailPage — item detail view + not-found state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookDetailPage } from '@/pages/BookDetailPage';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';

// Mock hooks
vi.mock('@/hooks/useFileSystem', () => ({
  useFileSystem: vi.fn(() => ({
    fs: {} as any,
  })),
}));

vi.mock('@/hooks/useCoverUrl', () => ({
  useCoverUrl: vi.fn(() => null),
}));

// Mock all lazy-loaded readers to avoid importing heavy deps
vi.mock('@/components/reader/EpubReader', () => ({
  EpubReader: () => <div data-testid="epub-reader" />,
}));
vi.mock('@/components/reader/PdfReader', () => ({
  PdfReader: () => <div data-testid="pdf-reader" />,
}));
vi.mock('@/components/reader/ComicReader', () => ({
  ComicReader: () => <div data-testid="comic-reader" />,
}));
vi.mock('@/components/reader/VideoReader', () => ({
  VideoReader: () => <div data-testid="video-reader" />,
}));
vi.mock('@/components/reader/MarkdownViewer', () => ({
  MarkdownViewer: () => <div data-testid="markdown-viewer" />,
}));

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'test-book',
    title: 'Don Quijote',
    subtitle: 'De la Mancha',
    authors: ['Miguel de Cervantes'],
    tags: ['clasico', 'novela'],
    formats: ['epub', 'pdf'],
    status: 'reading',
    vaultPath: 'books/Don Quijote',
    notePath: 'books/Don Quijote/Don Quijote.md',
    filePaths: {
      epub: 'books/Don Quijote/Don Quijote.epub',
      pdf: 'books/Don Quijote/Don Quijote.pdf',
    } as any,
    progress: 42,
    year: '1605',
    publisher: 'Juan de la Cuesta',
    language: 'Espanol',
    pages: 863,
    isbn: '978-0-14-044909-0',
    annotationCount: 5,
    ...overrides,
  };
}

function renderPage(id: string = 'test-book') {
  return render(
    <MemoryRouter initialEntries={[`/item/${id}`]}>
      <Routes>
        <Route path="/item/:id" element={<BookDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useLibraryStore.setState({ items: [makeItem()] });
});

describe('BookDetailPage', () => {
  // ---- Not found state ----

  it('shows not-found when item does not exist', () => {
    renderPage('nonexistent');
    expect(screen.getByText('Item no encontrado')).toBeInTheDocument();
  });

  it('shows the missing ID in not-found state', () => {
    renderPage('nonexistent');
    expect(screen.getByText(/nonexistent/)).toBeInTheDocument();
  });

  it('shows link back to library in not-found state', () => {
    renderPage('nonexistent');
    const link = screen.getByText('Volver a la biblioteca');
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  // ---- Item found — header ----

  it('renders item title', () => {
    renderPage();
    expect(screen.getByText('Don Quijote')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    renderPage();
    expect(screen.getByText('De la Mancha')).toBeInTheDocument();
  });

  it('renders authors', () => {
    renderPage();
    expect(screen.getByText('Miguel de Cervantes')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    renderPage();
    expect(screen.getByText('Leyendo')).toBeInTheDocument();
  });

  it('renders format badges', () => {
    renderPage();
    expect(screen.getByText('epub')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('renders "Volver" back link', () => {
    renderPage();
    expect(screen.getByText('Volver')).toBeInTheDocument();
  });

  // ---- Progress ----

  it('shows progress percentage', () => {
    renderPage();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('hides progress when zero', () => {
    useLibraryStore.setState({ items: [makeItem({ progress: 0 })] });
    renderPage();
    expect(screen.queryByText('Progreso de lectura')).not.toBeInTheDocument();
  });

  // ---- Metadata ----

  it('shows year', () => {
    renderPage();
    expect(screen.getByText('Ano')).toBeInTheDocument();
    expect(screen.getByText('1605')).toBeInTheDocument();
  });

  it('shows publisher', () => {
    renderPage();
    expect(screen.getByText('Editorial')).toBeInTheDocument();
    expect(screen.getByText('Juan de la Cuesta')).toBeInTheDocument();
  });

  it('shows language', () => {
    renderPage();
    expect(screen.getByText('Idioma')).toBeInTheDocument();
    expect(screen.getByText('Espanol')).toBeInTheDocument();
  });

  it('shows pages', () => {
    renderPage();
    expect(screen.getByText('Paginas')).toBeInTheDocument();
    expect(screen.getByText('863')).toBeInTheDocument();
  });

  it('shows ISBN', () => {
    renderPage();
    expect(screen.getByText('ISBN')).toBeInTheDocument();
    expect(screen.getByText('978-0-14-044909-0')).toBeInTheDocument();
  });

  it('shows annotation count', () => {
    renderPage();
    expect(screen.getByText('Anotaciones')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // ---- Tags ----

  it('renders tags', () => {
    renderPage();
    expect(screen.getByText('clasico')).toBeInTheDocument();
    expect(screen.getByText('novela')).toBeInTheDocument();
  });

  it('hides tags section when no tags', () => {
    useLibraryStore.setState({ items: [makeItem({ tags: [] })] });
    renderPage();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  // ---- Actions ----

  it('renders read buttons for each format (excluding md)', () => {
    renderPage();
    expect(screen.getByText('Leer EPUB')).toBeInTheDocument();
    expect(screen.getByText('Leer PDF')).toBeInTheDocument();
  });

  it('renders "Ver notas" button when notePath exists', () => {
    renderPage();
    expect(screen.getByText('Ver notas')).toBeInTheDocument();
  });

  it('hides "Ver notas" when no notePath', () => {
    useLibraryStore.setState({ items: [makeItem({ notePath: '' })] });
    renderPage();
    expect(screen.queryByText('Ver notas')).not.toBeInTheDocument();
  });

  // ---- Vault path ----

  it('shows vault path', () => {
    renderPage();
    expect(screen.getByText('books/Don Quijote')).toBeInTheDocument();
  });

  // ---- No authors ----

  it('shows nothing when authors array is empty', () => {
    useLibraryStore.setState({ items: [makeItem({ authors: [] })] });
    renderPage();
    // Should not render the authors paragraph at all
    expect(screen.queryByText('Miguel de Cervantes')).not.toBeInTheDocument();
  });

  // ---- Placeholder cover ----

  it('shows "B" placeholder for books without cover', () => {
    useLibraryStore.setState({ items: [makeItem({ formats: ['epub'] })] });
    renderPage();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('shows "C" placeholder for comics without cover', () => {
    useLibraryStore.setState({
      items: [makeItem({ formats: ['cbz'], filePaths: { cbz: 'comics/test.cbz' } as any })],
    });
    renderPage();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});
