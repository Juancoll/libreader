/**
 * IndexedDB cache for parsed vault items.
 * Pattern: stale-while-revalidate — show cached items immediately,
 * re-parse in background, update if differences found.
 */
import type { LibraryItem } from '@/types';

const DB_NAME = 'libreader-vault-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const ITEMS_KEY = 'vault-items';

interface CacheEntry {
  items: LibraryItem[];
  timestamp: number;
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Load cached items from IndexedDB. Returns null if no cache. */
export async function loadCachedItems(): Promise<CacheEntry | null> {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(ITEMS_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

/** Save parsed items to IndexedDB cache. */
export async function saveCachedItems(items: LibraryItem[]): Promise<void> {
  try {
    const db = await openCacheDB();
    const entry: CacheEntry = { items, timestamp: Date.now() };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry, ITEMS_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // Cache write failure is non-critical
  }
}

/** Clear the cache (e.g. when vault changes). */
export async function clearVaultCache(): Promise<void> {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(ITEMS_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // Ignore
  }
}

/**
 * Compare cached items with fresh items.
 * Returns true if they differ (new/removed/changed items).
 */
export function itemsHaveChanged(cached: LibraryItem[], fresh: LibraryItem[]): boolean {
  if (cached.length !== fresh.length) return true;

  // Build id→item map for fresh items
  const freshMap = new Map<string, LibraryItem>();
  for (const item of fresh) {
    freshMap.set(item.id, item);
  }

  for (const cachedItem of cached) {
    const freshItem = freshMap.get(cachedItem.id);
    if (!freshItem) return true; // item removed or id changed

    // Check key fields that can change
    if (
      cachedItem.title !== freshItem.title ||
      cachedItem.cover !== freshItem.cover ||
      cachedItem.status !== freshItem.status ||
      cachedItem.rating !== freshItem.rating ||
      cachedItem.progress !== freshItem.progress ||
      cachedItem.annotationCount !== freshItem.annotationCount ||
      cachedItem.authors.join(',') !== freshItem.authors.join(',') ||
      cachedItem.formats.join(',') !== freshItem.formats.join(',') ||
      cachedItem.tags.join(',') !== freshItem.tags.join(',')
    ) {
      return true;
    }
  }

  return false;
}
