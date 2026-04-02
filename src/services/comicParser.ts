/**
 * Comic archive parser - handles CBZ (ZIP) and CBR (RAR) files.
 * Extracts image pages from the archive with dimension detection.
 */

import { unzipSync } from 'fflate';

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;

export interface ComicPage {
  name: string;
  blob: Blob;
  url: string;
  /** Natural width of the image (populated after loadPageDimensions) */
  width?: number;
  /** Natural height of the image (populated after loadPageDimensions) */
  height?: number;
  /** Whether this is a wide/landscape page (aspect ratio < 1.2 means width > height) */
  isWide?: boolean;
}

/**
 * Load the natural dimensions of a page by creating an Image element.
 * Returns a promise that resolves when dimensions are available.
 */
export function loadPageDimensions(page: ComicPage): Promise<ComicPage> {
  return new Promise((resolve) => {
    if (page.width && page.height) {
      resolve(page);
      return;
    }
    const img = new Image();
    img.onload = () => {
      page.width = img.naturalWidth;
      page.height = img.naturalHeight;
      page.isWide = img.naturalWidth / img.naturalHeight > 1.2;
      resolve(page);
    };
    img.onerror = () => {
      // Fallback: assume portrait
      page.width = 800;
      page.height = 1200;
      page.isWide = false;
      resolve(page);
    };
    img.src = page.url;
  });
}

/**
 * Load dimensions for all pages. Processes in batches for performance.
 */
export async function loadAllDimensions(pages: ComicPage[], batchSize = 10): Promise<void> {
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);
    await Promise.all(batch.map(loadPageDimensions));
  }
}

/**
 * Build spread pairs from pages.
 * Rules:
 * - First page is always single (cover)
 * - Wide pages are always single
 * - Otherwise pair consecutive portrait pages
 * - RTL reverses the pair order (right page first visually)
 */
export function buildSpreads(pages: ComicPage[], rtl = false): number[][] {
  const spreads: number[][] = [];
  let i = 0;

  while (i < pages.length) {
    const page = pages[i];

    // Cover (first page) or wide pages are always solo
    if (i === 0 || page.isWide) {
      spreads.push([i]);
      i++;
      continue;
    }

    // Try to pair with next page
    const next = i + 1 < pages.length ? pages[i + 1] : null;
    if (next && !next.isWide) {
      // Pair them
      if (rtl) {
        spreads.push([i + 1, i]); // Right page first in RTL
      } else {
        spreads.push([i, i + 1]);
      }
      i += 2;
    } else {
      // Solo page
      spreads.push([i]);
      i++;
    }
  }

  return spreads;
}

/**
 * Extract image pages from a CBZ file (ZIP format).
 */
export function extractCbz(data: ArrayBuffer): ComicPage[] {
  const uint8 = new Uint8Array(data);
  const files = unzipSync(uint8);

  const pages: ComicPage[] = [];

  // Sort entries by name for correct page order
  const entries = Object.entries(files)
    .filter(([name]) => IMAGE_EXTENSIONS.test(name) && !name.startsWith('__MACOSX'))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  for (const [name, content] of entries) {
    const ext = name.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';

    const blob = new Blob([content as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);

    pages.push({
      name: name.split('/').pop() || name,
      blob,
      url,
    });
  }

  return pages;
}

/**
 * Lazily load and initialize libarchive.js.
 * Dynamic import avoids breaking Vite's dep optimizer (the library uses
 * Worker + WASM which doesn't survive pre-bundling).
 */
let _archiveClass: typeof import('libarchive.js').Archive | null = null;
async function getArchive() {
  if (!_archiveClass) {
    const mod = await import('libarchive.js');
    _archiveClass = mod.Archive;
    // Worker + WASM files are copied to public/ so they are served from the root.
    _archiveClass.init({ workerUrl: '/libarchive-worker.js' });
  }
  return _archiveClass;
}

/**
 * Recursively collect all File objects from the nested object returned by
 * `archiveReader.extractFiles()`. Returns them sorted by path for correct
 * page ordering.
 */
function collectFiles(obj: Record<string, unknown>, prefix = ''): { path: string; file: File }[] {
  const result: { path: string; file: File }[] = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val instanceof File) {
      result.push({ path: prefix + key, file: val });
    } else if (val && typeof val === 'object') {
      result.push(...collectFiles(val as Record<string, unknown>, prefix + key + '/'));
    }
  }
  return result;
}

/**
 * Extract image pages from a CBR file (RAR format).
 * Uses libarchive.js (WASM) for proper RAR decompression in the browser.
 */
export async function extractCbr(data: ArrayBuffer): Promise<ComicPage[]> {
  const Archive = await getArchive();

  // libarchive.js expects a File object
  const file = new File([data], 'comic.cbr', { type: 'application/x-rar-compressed' });
  const reader = await Archive.open(file);
  const content = await reader.extractFiles();
  await reader.close();

  // Collect all extracted files and filter to images
  const allFiles = collectFiles(content as Record<string, unknown>);
  const imageFiles = allFiles
    .filter(({ path }) => IMAGE_EXTENSIONS.test(path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  if (imageFiles.length === 0) {
    throw new Error('No se encontraron imagenes en el archivo CBR.');
  }

  const pages: ComicPage[] = [];
  for (const { path, file: imgFile } of imageFiles) {
    const ext = path.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';

    const blob = new Blob([await imgFile.arrayBuffer()], { type: mimeType });
    const url = URL.createObjectURL(blob);

    pages.push({
      name: path.split('/').pop() || path,
      blob,
      url,
    });
  }

  return pages;
}

/**
 * Cleanup blob URLs to prevent memory leaks.
 */
export function cleanupPages(pages: ComicPage[]): void {
  for (const page of pages) {
    URL.revokeObjectURL(page.url);
  }
}
