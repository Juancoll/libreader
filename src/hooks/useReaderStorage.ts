/**
 * Shared localStorage helpers for all readers.
 *
 * Each reader uses a prefix-based key pattern:
 *   `libreader:{prefix}:{filePath}:{type}`
 *
 * For example:
 *   - Comic: `libreader:comic:path/to/file.cbz:settings`
 *   - PDF:   `libreader:pdf:path/to/file.pdf:position`
 *   - EPUB:  `libreader:path/to/file.epub:position` (legacy, no prefix)
 */

export function getStorageKey(prefix: string, filePath: string, type: string): string {
  if (prefix) {
    return `libreader:${prefix}:${filePath}:${type}`;
  }
  // EPUB uses legacy format without prefix
  return `libreader:${filePath}:${type}`;
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* quota exceeded, ignore */ }
}

/** Format seconds as m:ss (used by AnnotationsPanel + VoiceCommentsPanel) */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
