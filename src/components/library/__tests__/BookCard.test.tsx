/**
 * Tests for BookCard and BookListItem components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookCard, BookListItem } from '@/components/library/BookCard';
import type { LibraryItem } from '@/types';

// Mock useCoverUrl hook
vi.mock('@/hooks/useCoverUrl', () => ({
  useCoverUrl: vi.fn().mockReturnValue(null),
}));

import { useCoverUrl } from '@/hooks/useCoverUrl';
const mockUseCoverUrl = vi.mocked(useCoverUrl);

// ---- Helpers ----

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'test-item-1',
    title: 'El Quijote',
    subtitle: 'De la Mancha',
    authors: ['Miguel de Cervantes'],
    tags: ['clasico', 'novela'],
    formats: ['epub', 'pdf'],
    status: 'reading',
    vaultPath: 'books/El Quijote',
    notePath: 'books/El Quijote/El Quijote.md',
    filePaths: {} as any,
    progress: 42,
    ...overrides,
  };
}

const mockFs = null;

function renderCard(item: LibraryItem = makeItem()) {
  return render(
    <MemoryRouter>
      <BookCard item={item} fs={mockFs} />
    </MemoryRouter>
  );
}

function renderListItem(item: LibraryItem = makeItem()) {
  return render(
    <MemoryRouter>
      <BookListItem item={item} fs={mockFs} />
    </MemoryRouter>
  );
}

// ---- Tests ----

describe('BookCard', () => {
  beforeEach(() => {
    mockUseCoverUrl.mockReturnValue(null);
  });

  it('renders the title', () => {
    renderCard();
    expect(screen.getByText('El Quijote')).toBeInTheDocument();
  });

  it('renders authors', () => {
    renderCard();
    expect(screen.getByText('Miguel de Cervantes')).toBeInTheDocument();
  });

  it('renders format badges', () => {
    renderCard();
    expect(screen.getByText('epub')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('renders tags (max 3)', () => {
    renderCard(makeItem({ tags: ['tag1', 'tag2', 'tag3', 'tag4'] }));
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
    expect(screen.getByText('tag3')).toBeInTheDocument();
    expect(screen.queryByText('tag4')).not.toBeInTheDocument();
  });

  it('renders status dot with correct title', () => {
    renderCard(makeItem({ status: 'reading' }));
    const dot = screen.getByTitle('Leyendo');
    expect(dot).toBeInTheDocument();
  });

  it('renders status labels correctly for all statuses', () => {
    const statusMap = [
      ['to-read', 'Por leer'],
      ['reading', 'Leyendo'],
      ['finished', 'Terminado'],
      ['abandoned', 'Abandonado'],
    ] as const;

    for (const [status, label] of statusMap) {
      const { unmount } = renderCard(makeItem({ status }));
      expect(screen.getByTitle(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('links to the correct detail page', () => {
    renderCard();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/item/test-item-1');
  });

  it('shows format icon when no cover (epub = B)', () => {
    renderCard(makeItem({ formats: ['epub'] }));
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('shows comic icon for comic formats', () => {
    renderCard(makeItem({ formats: ['cbz'] }));
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders cover image when available', () => {
    mockUseCoverUrl.mockReturnValue('blob:cover-url');
    renderCard();
    const img = screen.getByAltText('El Quijote');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'blob:cover-url');
  });

  it('does not render authors section when empty', () => {
    renderCard(makeItem({ authors: [] }));
    expect(screen.queryByText('Miguel de Cervantes')).not.toBeInTheDocument();
  });

  it('does not render tags section when empty', () => {
    renderCard(makeItem({ tags: [] }));
    // No tag text should appear - the tag container uses text-[10px] class
    // The only rounded-full element should be the status dot
    const tagSpans = screen.queryAllByText(/clasico|novela/);
    expect(tagSpans).toHaveLength(0);
  });

  it('passes archivePath for comics without cover', () => {
    mockUseCoverUrl.mockReturnValue(null);
    renderCard(makeItem({
      cover: undefined,
      formats: ['cbz'],
      filePaths: { cbz: 'comics/test.cbz' } as any,
    }));
    expect(mockUseCoverUrl).toHaveBeenCalledWith(
      null,
      undefined,
      'comics/test.cbz'
    );
  });
});

describe('BookListItem', () => {
  beforeEach(() => {
    mockUseCoverUrl.mockReturnValue(null);
  });

  it('renders the title', () => {
    renderListItem();
    expect(screen.getByText('El Quijote')).toBeInTheDocument();
  });

  it('renders authors', () => {
    renderListItem();
    expect(screen.getByText('Miguel de Cervantes')).toBeInTheDocument();
  });

  it('does not render authors section when empty (list)', () => {
    renderListItem(makeItem({ authors: [] }));
    expect(screen.queryByText('Autor desconocido')).not.toBeInTheDocument();
  });

  it('renders progress percentage', () => {
    renderListItem(makeItem({ progress: 42 }));
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('does not render progress when 0', () => {
    renderListItem(makeItem({ progress: 0 }));
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders format badges', () => {
    renderListItem();
    expect(screen.getByText('epub')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('links to the correct detail page', () => {
    renderListItem();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/item/test-item-1');
  });

  it('renders cover image when available', () => {
    mockUseCoverUrl.mockReturnValue('blob:cover');
    renderListItem();
    const img = screen.getByAltText('El Quijote');
    expect(img).toHaveAttribute('src', 'blob:cover');
  });
});
