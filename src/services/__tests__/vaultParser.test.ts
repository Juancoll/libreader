/**
 * Tests for vaultParser service.
 * Tests the pure utility functions and the main parsing logic
 * using a mock FSAdapter.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseVault, parseReadingProgress } from '@/services/vaultParser';
import type { FSAdapter, DirEntry } from '@/services/vaultParser';
import type { LibraryItem } from '@/types';
import type { ParseVaultConfig } from '@/services/vaultParser';

// ---- Helpers ----

/** Standard config with books + comics folders */
const defaultConfig: ParseVaultConfig = {
  folders: [
    { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
    { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
  ],
};

// ---- Mock FSAdapter ----

interface MockFile {
  content: string;
  binary?: ArrayBuffer;
}

function createMockFS(fileSystem: Record<string, MockFile | 'dir'>): FSAdapter {
  const getDirEntries = (path: string): DirEntry[] => {
    const prefix = path ? path + '/' : '';
    const entries = new Map<string, DirEntry>();

    for (const key of Object.keys(fileSystem)) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const parts = rest.split('/');
      const name = parts[0];
      if (!name || name.startsWith('.')) continue;

      const entryPath = prefix + name;
      if (!entries.has(name)) {
        entries.set(name, {
          name,
          isDirectory: parts.length > 1 || fileSystem[entryPath] === 'dir',
          path: entryPath,
        });
      }
    }

    return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    readDir: vi.fn().mockImplementation(async (path: string) => {
      return getDirEntries(path);
    }),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      const file = fileSystem[path];
      if (!file || file === 'dir') throw new Error(`Not found: ${path}`);
      return file.content;
    }),
    readBinaryFile: vi.fn().mockImplementation(async (path: string) => {
      const file = fileSystem[path];
      if (!file || file === 'dir') throw new Error(`Not found: ${path}`);
      return file.binary || new ArrayBuffer(0);
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (path: string) => {
      return path in fileSystem;
    }),
    getFileUrl: vi.fn().mockImplementation(async (path: string) => {
      return `blob:${path}`;
    }),
  };
}

// ---- Test data ----

const bookMd = `---
title: "El Quijote"
subtitle: "De la Mancha"
cover: "[[quijote-cover.jpg]]"
year: 1605
authors:
  - "[[Miguel de Cervantes]]"
isbn: "978-0-123456-78-9"
publisher: "Editorial Ejemplo"
language: "es"
pages: 863
status: "reading"
rating: 5
date_started: "2025-01-01"
tags:
  - clasico
  - novela
formats:
  - epub
  - pdf
---

# El Quijote

Una gran novela...
`;

// Author fixture — reserved for future author parsing tests
// const authorMd = `---
// name: "Miguel de Cervantes"
// birth_date: "1547-09-29"
// death_date: "1616-04-22"
// photo: "[[cervantes.jpg]]"
// nationality: "Español"
// tags:
//   - clasico
//   - siglo-de-oro
// ---
// `;

const stateJson = JSON.stringify({
  file: 'El Quijote.epub',
  format: 'epub',
  currentPage: 120,
  totalPages: 863,
  progress: 0.139,
  lastRead: '2025-06-15T10:30:00.000Z',
  location: 'epubcfi(/6/14)',
});

// ---- Tests ----

describe('vaultParser', () => {
  describe('parseVault', () => {
    it('parses books from the books directory', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/El Quijote': 'dir',
        'books/El Quijote/El Quijote.md': { content: bookMd },
        'books/El Quijote/El Quijote.epub': { content: '' },
        'books/El Quijote/El Quijote.pdf': { content: '' },
        'books/El Quijote/quijote-cover.jpg': { content: '' },
        'comics': 'dir',
      });

      const items = await parseVault(fs, {
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
        ],
      });

      expect(items).toHaveLength(1);
      const book = items[0];
      expect(book.title).toBe('El Quijote');
      expect(book.subtitle).toBe('De la Mancha');
      expect(book.year).toBe('1605');
      expect(book.authors).toContain('Miguel de Cervantes');
      expect(book.isbn).toBe('978-0-123456-78-9');
      expect(book.publisher).toBe('Editorial Ejemplo');
      expect(book.language).toBe('es');
      expect(book.pages).toBe(863);
      expect(book.status).toBe('reading');
      expect(book.rating).toBe(5);
      expect(book.tags).toContain('clasico');
      expect(book.folder).toBe('Libros');
    });

    it('detects file formats from directory content', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/Book': 'dir',
        'books/Book/Book.md': { content: bookMd },
        'books/Book/Book.epub': { content: '' },
        'books/Book/Book.pdf': { content: '' },
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].filePaths).toHaveProperty('epub');
      expect(items[0].filePaths).toHaveProperty('pdf');
    });

    it('finds cover from item directory', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/Book': 'dir',
        'books/Book/Book.md': { content: bookMd },
        'books/Book/quijote-cover.jpg': { content: '' },
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].cover).toBe('books/Book/quijote-cover.jpg');
    });

    it('resolves cover from vault-wide image index', async () => {
      const mdWithRemoteCover = `---
title: "Test Book"
cover: "[[remote-cover.png]]"
tags: []
authors: []
formats: []
---
`;
      const fs = createMockFS({
        'books': 'dir',
        'books/TestBook': 'dir',
        'books/TestBook/TestBook.md': { content: mdWithRemoteCover },
        'books/SharedCovers': 'dir',
        'books/SharedCovers/remote-cover.png': { content: '' },
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].cover).toBe('books/SharedCovers/remote-cover.png');
    });

    it('parses comics from individual folders with .md metadata', async () => {
      const comicMd = `---
title: "Largo Winch - T01 - L'Héritier"
cover: "[[Largo Winch - T01 - L'Héritier.jpg]]"
authors:
  - "[[Jean Van Hamme]]"
  - "[[Philippe Francq]]"
tags:
  - largo-winch
  - bd
formats:
  - cbz
status: to-read
---
`;
      const comicMd2 = `---
title: "Largo Winch - T02 - Le Groupe W"
cover: "[[Largo Winch - T02 - Le Groupe W.jpg]]"
authors:
  - "[[Jean Van Hamme]]"
  - "[[Philippe Francq]]"
tags:
  - largo-winch
  - bd
formats:
  - cbz
status: to-read
---
`;
      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
        'comics/Largo Winch - T01 - L Heritier': 'dir',
        'comics/Largo Winch - T01 - L Heritier/Largo Winch - T01 - L Heritier.md': { content: comicMd },
        'comics/Largo Winch - T01 - L Heritier/Largo Winch - T01 - L Heritier.jpg': { content: '' },
        'comics/Largo Winch - T01 - L Heritier/Largo Winch - T01 - L Heritier.cbz': { content: '' },
        'comics/Largo Winch - T02 - Le Groupe W': 'dir',
        'comics/Largo Winch - T02 - Le Groupe W/Largo Winch - T02 - Le Groupe W.md': { content: comicMd2 },
        'comics/Largo Winch - T02 - Le Groupe W/Largo Winch - T02 - Le Groupe W.jpg': { content: '' },
        'comics/Largo Winch - T02 - Le Groupe W/Largo Winch - T02 - Le Groupe W.cbz': { content: '' },
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items).toHaveLength(2);
      expect(items[0].formats).toContain('cbz');
      expect(items[0].authors).toContain('Jean Van Hamme');
      expect(items[0].cover).toBe('comics/Largo Winch - T01 - L Heritier/Largo Winch - T01 - L Heritier.jpg');
    });

    it('reads reading progress from .reading directory', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/Book': 'dir',
        'books/Book/Book.md': { content: bookMd },
        'books/Book/Book.epub': { content: '' },
        'books/Book/Book.epub.reading': 'dir',
        'books/Book/Book.epub.reading/state.json': { content: stateJson },
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].progress).toBe(14); // 0.139 * 100 rounded
    });

    it('generates unique IDs from paths', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/BookA': 'dir',
        'books/BookA/BookA.md': { content: bookMd },
        'books/BookB': 'dir',
        'books/BookB/BookB.md': { content: bookMd },
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      const ids = items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length); // all unique
    });

    it('handles empty vault', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items).toEqual([]);
    });

    it('skips directories without .md files', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/EmptyBook': 'dir',
        'books/EmptyBook/cover.jpg': { content: '' },
        'comics': 'dir',
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items).toHaveLength(0);
    });

    it('handles empty papers and courses dirs gracefully', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/Book': 'dir',
        'books/Book/Book.md': { content: bookMd },
        'books/Book/Book.epub': { content: '' },
        'comics': 'dir',
        'papers': 'dir',
        'courses': 'dir',
      });

      const items = await parseVault(fs, {
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Papers', path: 'papers', showInMenu: false, showInLibrary: true },
          { name: 'Cursos', path: 'courses', showInMenu: false, showInLibrary: true },
        ],
      });

      expect(items).toHaveLength(1);
      expect(items[0].folder).toBe('Libros');
    });

    it('skips dirs with empty string config', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'books/Book': 'dir',
        'books/Book/Book.md': { content: bookMd },
        'books/Book/Book.epub': { content: '' },
        'comics': 'dir',
      });

      const items = await parseVault(fs, {
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Papers', path: '', showInMenu: false, showInLibrary: true },
          { name: 'Cursos', path: '  ', showInMenu: false, showInLibrary: true },
        ],
      });

      expect(items).toHaveLength(1);
    });

    it('parses papers from papersDir', async () => {
      const paperMd = `---
title: "Attention Is All You Need"
authors:
  - Vaswani et al.
year: 2017
tags:
  - ml
  - transformers
formats:
  - pdf
---
`;
      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
        'papers': 'dir',
        'papers/Attention': 'dir',
        'papers/Attention/Attention.md': { content: paperMd },
        'papers/Attention/Attention.pdf': { content: '' },
      });

      const items = await parseVault(fs, {
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Papers', path: 'papers', showInMenu: false, showInLibrary: true },
        ],
      });

      expect(items).toHaveLength(1);
      expect(items[0].folder).toBe('Papers');
      expect(items[0].title).toBe('Attention Is All You Need');
    });

    it('parses the full real vault structure (14 books + comics with individual folders)', async () => {
      // Replica of the real vault after restructuring: each comic has its own folder
      const makeMd = (title: string, opts: Record<string, any> = {}) => {
        const lines = [
          '---',
          `title: "${title}"`,
        ];
        if (opts.subtitle) lines.push(`subtitle: "${opts.subtitle}"`);
        if (opts.cover) lines.push(`cover: "[[${opts.cover}]]"`);
        if (opts.year) lines.push(`year: "${opts.year}"`);
        lines.push('authors:');
        for (const a of (opts.authors || ['Author'])) lines.push(`  - "[[${a}]]"`);
        lines.push('tags:');
        for (const t of (opts.tags || ['test'])) lines.push(`  - "#${t}"`);
        lines.push('formats:');
        for (const f of (opts.formats || ['epub'])) lines.push(`  - ${f}`);
        lines.push('status: to-read');
        lines.push('---');
        return lines.join('\n');
      };

      const makeComicFolder = (basePath: string, name: string, format: string, opts: Record<string, any> = {}) => {
        const folder: Record<string, MockFile | 'dir'> = {};
        folder[`${basePath}/${name}`] = 'dir';
        folder[`${basePath}/${name}/${name}.md`] = {
          content: makeMd(name, {
            cover: `${name}.jpg`,
            formats: [format],
            authors: opts.authors || ['Author'],
            tags: opts.tags || ['comic'],
          }),
        };
        folder[`${basePath}/${name}/${name}.jpg`] = { content: '' };
        folder[`${basePath}/${name}/${name}.${format}`] = { content: '' };
        if (opts.readingProgress !== undefined) {
          folder[`${basePath}/${name}/${name}.${format}.reading`] = 'dir';
          folder[`${basePath}/${name}/${name}.${format}.reading/state.json`] = {
            content: JSON.stringify({ progress: opts.readingProgress }),
          };
        }
        return folder;
      };

      const comicAuthorsLW = ['Jean Van Hamme', 'Philippe Francq'];
      const comicAuthorsDantes = ['Pierre Boisserie', 'Éric Stalner'];

      const fs = createMockFS({
        // === BOOKS ===
        'books': 'dir',

        'books/A first course in network theory': 'dir',
        'books/A first course in network theory/A first course in network theory.md': { content: makeMd('A first course in network theory', { formats: ['pdf'], cover: 'A first course in network theory.png' }) },
        'books/A first course in network theory/A first course in network theory.pdf': { content: '' },
        'books/A first course in network theory/A first course in network theory.png': { content: '' },
        'books/A first course in network theory/A first course in network theory.pdf.reading': 'dir',
        'books/A first course in network theory/A first course in network theory.pdf.reading/state.json': { content: '{}' },

        'books/A merced de las redes': 'dir',
        'books/A merced de las redes/A merced de las redes.md': { content: makeMd('A merced de las redes', { formats: ['epub'], cover: 'A merced de las redes.png' }) },
        'books/A merced de las redes/A merced de las redes.epub': { content: '' },
        'books/A merced de las redes/A merced de las redes.png': { content: '' },

        'books/Artificial Intelligence - A Modern Approach': 'dir',
        'books/Artificial Intelligence - A Modern Approach/Artificial Intelligence - A Modern Approach.md': { content: makeMd('Artificial Intelligence - A Modern Approach', { subtitle: 'A Modern Approach', formats: ['epub'], cover: 'Artificial Intelligence - A Modern Approach.png' }) },
        'books/Artificial Intelligence - A Modern Approach/Artificial Intelligence - A Modern Approach.epub': { content: '' },
        'books/Artificial Intelligence - A Modern Approach/Artificial Intelligence - A Modern Approach.png': { content: '' },

        'books/Cuando los fisicos asaltaron los mercados': 'dir',
        'books/Cuando los fisicos asaltaron los mercados/Cuando los fisicos asaltaron los mercados.md': { content: makeMd('Cuando los fisicos asaltaron los mercados', { formats: ['epub'] }) },
        'books/Cuando los fisicos asaltaron los mercados/Cuando los fisicos asaltaron los mercados.epub': { content: '' },
        'books/Cuando los fisicos asaltaron los mercados/Cuando los fisicos asaltaron los mercados.png': { content: '' },

        'books/Deep Learning for Coders With Fastai and Pytorch': 'dir',
        'books/Deep Learning for Coders With Fastai and Pytorch/Deep Learning for Coders With Fastai and Pytorch.md': { content: makeMd('Deep Learning for Coders With Fastai and Pytorch', { formats: ['epub'], cover: 'Deep Learning for Coders With Fastai and Pytorch.png' }) },
        'books/Deep Learning for Coders With Fastai and Pytorch/Deep Learning for Coders With Fastai and Pytorch.epub': { content: '' },
        'books/Deep Learning for Coders With Fastai and Pytorch/Deep Learning for Coders With Fastai and Pytorch.pdf': { content: '' },
        'books/Deep Learning for Coders With Fastai and Pytorch/Deep Learning for Coders With Fastai and Pytorch.png': { content: '' },
        'books/Deep Learning for Coders With Fastai and Pytorch/Deep Learning for Coders With Fastai and Pytorch.epub.reading': 'dir',
        'books/Deep Learning for Coders With Fastai and Pytorch/Deep Learning for Coders With Fastai and Pytorch.epub.reading/state.json': { content: JSON.stringify({ progress: 0.15 }) },

        'books/El arte de la intrusion': 'dir',
        'books/El arte de la intrusion/El arte de la intrusion.md': { content: makeMd('El arte de la intrusion', { formats: ['epub'] }) },
        'books/El arte de la intrusion/El arte de la intrusion.epub': { content: '' },
        'books/El arte de la intrusion/El arte de la intrusion.png': { content: '' },

        'books/El cisne negro': 'dir',
        'books/El cisne negro/El cisne negro.md': { content: makeMd('El cisne negro', { formats: ['epub'], cover: 'El cisne negro.jpg' }) },
        'books/El cisne negro/El cisne negro.epub': { content: '' },
        'books/El cisne negro/El cisne negro.jpg': { content: '' },
        'books/El cisne negro/El cisne negro.sdr': 'dir',

        'books/El infinito en un junco': 'dir',
        'books/El infinito en un junco/El infinito en un junco.md': { content: makeMd('El infinito en un junco', { formats: ['epub'], cover: 'El infinito en un junco.jpg' }) },
        'books/El infinito en un junco/El infinito en un junco.epub': { content: '' },
        'books/El infinito en un junco/El infinito en un junco.jpg': { content: '' },

        'books/Linux Kernel Development': 'dir',
        'books/Linux Kernel Development/Linux Kernel Development.md': { content: makeMd('Linux Kernel Development', { formats: ['epub', 'pdf'] }) },
        'books/Linux Kernel Development/Linux Kernel Development.epub': { content: '' },
        'books/Linux Kernel Development/Linux Kernel Development.pdf': { content: '' },
        'books/Linux Kernel Development/Linux Kernel Development.png': { content: '' },

        'books/Maniac': 'dir',
        'books/Maniac/Maniac.md': { content: makeMd('Maniac', { formats: ['epub'], cover: 'Maniac.jpg' }) },
        'books/Maniac/Maniac.epub': { content: '' },
        'books/Maniac/Maniac.jpg': { content: '' },

        'books/Modern Operating Systems': 'dir',
        'books/Modern Operating Systems/Modern Operating Systems.md': { content: makeMd('Modern Operating Systems', { formats: ['epub'], cover: 'Modern Operating Systems.png' }) },
        'books/Modern Operating Systems/Modern Operating Systems, 4th Ed.pdf': { content: '' },
        'books/Modern Operating Systems/Modern Operating Systems, 5th Ed.pdf': { content: '' },
        'books/Modern Operating Systems/Modern Operating Systems.png': { content: '' },

        'books/The Hundred-Page Machine Learning book': 'dir',
        'books/The Hundred-Page Machine Learning book/The Hundred-Page Machine Learning Book.md': { content: makeMd('The Hundred-Page Machine Learning Book', { formats: ['epub', 'pdf'] }) },
        'books/The Hundred-Page Machine Learning book/The Hundred-Page Machine Learning Book.epub': { content: '' },
        'books/The Hundred-Page Machine Learning book/The Hundred-Page Machine Learning Book.pdf': { content: '' },
        'books/The Hundred-Page Machine Learning book/The Hundred-Page Machine Learning Book.png': { content: '' },

        'books/The Structure of Complex Networks Theory and Applications': 'dir',
        'books/The Structure of Complex Networks Theory and Applications/The Structure of Complex Networks Theory and Applications.md': { content: makeMd('The Structure of Complex Networks Theory and Applications', { formats: ['epub', 'pdf'] }) },
        'books/The Structure of Complex Networks Theory and Applications/The Structure of Complex Networks Theory and Applications.pdf': { content: '' },
        'books/The Structure of Complex Networks Theory and Applications/The Structure of Complex Networks Theory and Applications.png': { content: '' },

        'books/Un fantasma en el sistema': 'dir',
        'books/Un fantasma en el sistema/Un fantasma en el sistema.md': { content: makeMd('Un fantasma en el sistema', { formats: ['epub'] }) },
        'books/Un fantasma en el sistema/Un fantasma en el sistema.epub': { content: '' },
        'books/Un fantasma en el sistema/Un fantasma en el sistema.png': { content: '' },

        // === COMICS (new individual folder structure) ===
        'comics': 'dir',

        // Largo Winch - 3 comics
        ...makeComicFolder('comics', 'Largo Winch - T01 - L Heritier', 'cbz', { authors: comicAuthorsLW, tags: ['largo-winch'] }),
        ...makeComicFolder('comics', 'Largo Winch - T02 - Le Groupe W', 'cbz', { authors: comicAuthorsLW, tags: ['largo-winch'] }),
        ...makeComicFolder('comics', 'Largo Winch - T03 - OPA', 'cbz', { authors: comicAuthorsLW, tags: ['largo-winch'] }),

        // Dantès - 2 comics
        ...makeComicFolder('comics', 'Dantès - T01 - La Chute', 'cbr', { authors: comicAuthorsDantes, tags: ['dantes'] }),
        ...makeComicFolder('comics', 'Dantès - T02 - Six ans', 'cbr', { authors: comicAuthorsDantes, tags: ['dantes'] }),

        // IR$ - 1 comic
        ...makeComicFolder('comics', 'IR$ - T01 - La Voie Fiscale', 'cbz', { tags: ['ir$'] }),

        // La Banque - 1 comic
        ...makeComicFolder('comics', 'La Banque - T01 - 1815-1848', 'cbz', { tags: ['la-banque'] }),

        // Secrets Bancaires - 1 comic (cbr format)
        ...makeComicFolder('comics', 'Secrets Bancaires - T01 - Les associes', 'cbr', { tags: ['secrets-bancaires'] }),
      });

      const items = await parseVault(fs, defaultConfig);

      const books = items.filter((i) => i.folder === 'Libros');
      const comics = items.filter((i) => i.folder === 'Comics');

      // Verify all 14 books parsed
      expect(books).toHaveLength(14);

      // Verify comics: 3 + 2 + 1 + 1 + 1 = 8
      expect(comics).toHaveLength(8);

      // Total
      expect(items).toHaveLength(22);

      // Verify specific books exist
      const bookTitles = books.map(b => b.title);
      expect(bookTitles).toContain('A first course in network theory');
      expect(bookTitles).toContain('Maniac');
      expect(bookTitles).toContain('El cisne negro');
      expect(bookTitles).toContain('El arte de la intrusion');
      expect(bookTitles).toContain('Un fantasma en el sistema');
      expect(bookTitles).toContain('Deep Learning for Coders With Fastai and Pytorch');

      // Verify progress read from .reading dir
      const deepLearning = books.find(b => b.title === 'Deep Learning for Coders With Fastai and Pytorch');
      expect(deepLearning).toBeDefined();
      expect(deepLearning!.progress).toBe(15);

      // Verify comic authors are parsed from .md frontmatter
      const lwComic = comics.find(c => c.title === 'Largo Winch - T01 - L Heritier');
      expect(lwComic).toBeDefined();
      expect(lwComic!.authors).toContain('Jean Van Hamme');
      expect(lwComic!.authors).toContain('Philippe Francq');

      // Verify comic formats
      const cbrComic = comics.find(c => c.formats.includes('cbr'));
      expect(cbrComic).toBeDefined();

      // Verify comic covers are found
      expect(lwComic!.cover).toContain('Largo Winch - T01 - L Heritier.jpg');
    });

    it('handles non-existent directory without crashing', async () => {
      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
      });

      // papersDir points to a dir that doesn't exist in the mock
      const items = await parseVault(fs, {
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Papers', path: 'nonexistent', showInMenu: false, showInLibrary: true },
        ],
      });

      expect(items).toEqual([]);
    });

    it('reads comic reading progress from .reading/state.json', async () => {
      const comicState = JSON.stringify({
        file: 'Series - T01 - Title.cbz',
        format: 'cbz',
        currentPage: 15,
        totalPages: 48,
        progress: 0.3125,
        lastRead: '2025-12-01T14:00:00.000Z',
      });

      const comicMd = `---
title: "Series - T01 - Title"
authors:
  - "[[Author]]"
tags:
  - series
formats:
  - cbz
status: to-read
---
`;

      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
        'comics/Series - T01 - Title': 'dir',
        'comics/Series - T01 - Title/Series - T01 - Title.md': { content: comicMd },
        'comics/Series - T01 - Title/Series - T01 - Title.cbz': { content: '' },
        'comics/Series - T01 - Title/Series - T01 - Title.cbz.reading': 'dir',
        'comics/Series - T01 - Title/Series - T01 - Title.cbz.reading/state.json': { content: comicState },
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items).toHaveLength(1);
      expect(items[0].progress).toBe(31); // 0.3125 * 100 rounded
      expect(items[0].status).toBe('reading');
    });

    it('sets comic status to finished when progress is 100%', async () => {
      const comicState = JSON.stringify({
        file: 'Series - T01 - Title.cbz',
        format: 'cbz',
        currentPage: 48,
        totalPages: 48,
        progress: 1.0,
        lastRead: '2025-12-01T14:00:00.000Z',
      });

      const comicMd = `---
title: "Series - T01 - Title"
authors:
  - "[[Author]]"
tags:
  - series
formats:
  - cbz
status: to-read
---
`;

      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
        'comics/Series - T01 - Title': 'dir',
        'comics/Series - T01 - Title/Series - T01 - Title.md': { content: comicMd },
        'comics/Series - T01 - Title/Series - T01 - Title.cbz': { content: '' },
        'comics/Series - T01 - Title/Series - T01 - Title.cbz.reading': 'dir',
        'comics/Series - T01 - Title/Series - T01 - Title.cbz.reading/state.json': { content: comicState },
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].progress).toBe(100);
      expect(items[0].status).toBe('finished');
    });

    it('comic without .reading dir has no progress and status to-read', async () => {
      const comicMd = `---
title: "Series - T01 - Title"
authors:
  - "[[Author]]"
tags:
  - series
formats:
  - cbz
status: to-read
---
`;

      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
        'comics/Series - T01 - Title': 'dir',
        'comics/Series - T01 - Title/Series - T01 - Title.md': { content: comicMd },
        'comics/Series - T01 - Title/Series - T01 - Title.cbz': { content: '' },
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].progress).toBeUndefined();
      expect(items[0].status).toBe('to-read');
    });

    it('reads comic annotation count from .reading/annotations.md', async () => {
      const comicState = JSON.stringify({
        file: 'Comic.cbz',
        format: 'cbz',
        currentPage: 10,
        totalPages: 30,
        progress: 0.333,
        lastRead: '2025-12-01T14:00:00.000Z',
      });
      const annotationsMd = `---
file: Comic.cbz
---

## Highlights

## Page 5 note

## Page 10 note
`;
      const comicMd = `---
title: "Comic"
authors:
  - "[[Author]]"
tags:
  - series
formats:
  - cbz
status: to-read
---
`;

      const fs = createMockFS({
        'books': 'dir',
        'comics': 'dir',
        'comics/Comic': 'dir',
        'comics/Comic/Comic.md': { content: comicMd },
        'comics/Comic/Comic.cbz': { content: '' },
        'comics/Comic/Comic.cbz.reading': 'dir',
        'comics/Comic/Comic.cbz.reading/state.json': { content: comicState },
        'comics/Comic/Comic.cbz.reading/annotations.md': { content: annotationsMd },
      });

      const items = await parseVault(fs, defaultConfig);

      expect(items[0].progress).toBe(33);
      expect(items[0].annotationCount).toBe(3);
    });
  });

  describe('parseReadingProgress', () => {
    it('parses reading progress from .reading directory', async () => {
      const fs = createMockFS({
        'books/Book': 'dir',
        'books/Book/Book.epub.reading': 'dir',
        'books/Book/Book.epub.reading/state.json': { content: stateJson },
      });

      const item: LibraryItem = {
        id: 'test',
        title: 'Test',
        authors: [],
        tags: [],
        formats: ['epub'],
        status: 'reading',
        vaultPath: 'books/Book',
        notePath: 'books/Book/Book.md',
        filePaths: { epub: 'books/Book/Book.epub' } as any,
      };

      const progress = await parseReadingProgress(fs, item);
      expect(progress).not.toBeNull();
      expect(progress!.percentage).toBe(14);
      expect(progress!.format).toBe('epub');
      expect(progress!.itemId).toBe('test');
    });

    it('returns null when no .reading directory exists', async () => {
      const fs = createMockFS({
        'books/Book': 'dir',
        'books/Book/Book.md': { content: bookMd },
      });

      const item: LibraryItem = {
        id: 'test',
        title: 'Test',
        authors: [],
        tags: [],
        formats: ['epub'],
        status: 'to-read',
        vaultPath: 'books/Book',
        notePath: 'books/Book/Book.md',
        filePaths: {} as any,
      };

      const progress = await parseReadingProgress(fs, item);
      expect(progress).toBeNull();
    });
  });
});
