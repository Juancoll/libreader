import { useState, useEffect, useRef } from 'react';
import type { FSAdapter } from '@/services/vaultParser';
import { extractCbz } from '@/services/comicParser';

/** Cache of extracted comic covers: filePath -> blob URL */
const comicCoverCache = new Map<string, string>();

/**
 * Hook that resolves a vault path to a blob URL for displaying images.
 * If coverPath is undefined but archivePath is provided (for comics),
 * extracts the first page from the CBZ as a cover thumbnail.
 */
export function useCoverUrl(
  fs: FSAdapter | null,
  coverPath: string | undefined,
  archivePath?: string
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const extractedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!fs) {
      setUrl(null);
      return;
    }

    // Cancellation ref — shared by reference so async functions see updates
    const cancelRef = { current: false };

    // If we have a static cover path, use it directly
    if (coverPath) {
      fs.getFileUrl(coverPath).then((blobUrl) => {
        if (!cancelRef.current) setUrl(blobUrl);
      }).catch(() => {
        if (!cancelRef.current) {
          // Cover path failed, try archive fallback
          if (archivePath) {
            extractComicCover(fs, archivePath, cancelRef, setUrl, extractedUrlRef);
          } else {
            setUrl(null);
          }
        }
      });
      return () => { cancelRef.current = true; };
    }

    // No cover path - try extracting from archive
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
