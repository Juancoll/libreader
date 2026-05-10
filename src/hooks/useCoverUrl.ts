import { useState, useEffect, useRef } from 'react';
import type { FSAdapter } from '@/services/vaultParser';
import { extractCbz } from '@/services/comicParser';

/** Cache of extracted comic covers: filePath -> blob URL */
const comicCoverCache = new Map<string, string>();

/** Cache of resolved cover URLs: vaultPath -> blob URL */
const coverUrlCache = new Map<string, string>();

// ---- Concurrency-limited queue for cover loading ----
const MAX_CONCURRENT = 6;
let running = 0;
const queue: Array<() => void> = [];

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      fn().then(resolve, reject).finally(() => {
        running--;
        if (queue.length > 0) {
          queue.shift()!();
        }
      });
    };
    if (running < MAX_CONCURRENT) {
      run();
    } else {
      queue.push(run);
    }
  });
}

/**
 * Hook that resolves a vault path to a blob URL for displaying images.
 * If coverPath is undefined but archivePath is provided (for comics),
 * extracts the first page from the CBZ as a cover thumbnail.
 * Uses a concurrency-limited queue to avoid overwhelming the FS API.
 */
export function useCoverUrl(
  fs: FSAdapter | null,
  coverPath: string | undefined,
  archivePath?: string
): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    // Sync init from cache
    if (coverPath && coverUrlCache.has(coverPath)) return coverUrlCache.get(coverPath)!;
    if (archivePath && comicCoverCache.has(archivePath)) return comicCoverCache.get(archivePath)!;
    return null;
  });
  const extractedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!fs) {
      setUrl(null);
      return;
    }

    const cancelRef = { current: false };

    if (coverPath) {
      // Return cached immediately
      const cached = coverUrlCache.get(coverPath);
      if (cached) {
        setUrl(cached);
        return;
      }

      enqueue(() => fs.getFileUrl(coverPath)).then((blobUrl) => {
        coverUrlCache.set(coverPath, blobUrl);
        if (!cancelRef.current) setUrl(blobUrl);
      }).catch(() => {
        if (!cancelRef.current) {
          if (archivePath) {
            extractComicCover(fs, archivePath, cancelRef, setUrl, extractedUrlRef);
          } else {
            setUrl(null);
          }
        }
      });
      return () => { cancelRef.current = true; };
    }

    if (archivePath && archivePath.endsWith('.cbz')) {
      extractComicCover(fs, archivePath, cancelRef, setUrl, extractedUrlRef);
      return () => { cancelRef.current = true; };
    }

    setUrl(null);
  }, [fs, coverPath, archivePath]);

  return url;
}

async function extractComicCover(
  fs: FSAdapter,
  archivePath: string,
  cancelRef: { current: boolean },
  setUrl: (url: string | null) => void,
  extractedUrlRef: React.RefObject<string | null>
) {
  // Check cache first
  const cached = comicCoverCache.get(archivePath);
  if (cached) {
    if (!cancelRef.current) setUrl(cached);
    return;
  }

  try {
    const data = await fs.readBinaryFile(archivePath);
    if (cancelRef.current) return;

    const pages = extractCbz(data);
    if (pages.length > 0 && !cancelRef.current) {
      const coverUrl = pages[0].url;
      comicCoverCache.set(archivePath, coverUrl);
      extractedUrlRef.current = coverUrl;
      setUrl(coverUrl);

      // Cleanup other pages (keep only the first one)
      for (let i = 1; i < pages.length; i++) {
        URL.revokeObjectURL(pages[i].url);
      }
    } else {
      // Cleanup all if cancelled
      for (const page of pages) {
        URL.revokeObjectURL(page.url);
      }
      if (!cancelRef.current) setUrl(null);
    }
  } catch {
    if (!cancelRef.current) setUrl(null);
  }
}
