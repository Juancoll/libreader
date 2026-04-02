import { useCallback, useEffect, useRef } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { useFileSystem } from '@/hooks/useFileSystem';
import { parseVault } from '@/services/vaultParser';
import {
  loadCachedItems,
  saveCachedItems,
  itemsHaveChanged,
} from '@/services/vaultCache';

/**
 * Global vault loader hook.
 *
 * Uses stale-while-revalidate pattern:
 * 1. On mount, immediately load cached items from IndexedDB (instant)
 * 2. Once filesystem is ready, re-parse the vault in background
 * 3. If fresh items differ from cache, update the store + cache
 *
 * This means the library page shows content instantly on return visits,
 * while any vault changes are picked up within seconds.
 */
export function useVaultLoader() {
  const { fs, isReady, isRestoring } = useFileSystem();
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);
  const items = useLibraryStore((s) => s.items);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const setItems = useLibraryStore((s) => s.setItems);
  const setLoading = useLibraryStore((s) => s.setLoading);
  const setError = useLibraryStore((s) => s.setError);
  const autoLoaded = useRef(false);
  const cacheLoaded = useRef(false);

  // Phase 1: Load from cache immediately (before FS is even ready)
  useEffect(() => {
    if (cacheLoaded.current) return;
    cacheLoaded.current = true;

    loadCachedItems().then((entry) => {
      if (entry && entry.items.length > 0) {
        // Only set if store is still empty (no fresh parse has happened)
        const current = useLibraryStore.getState().items;
        if (current.length === 0) {
          setItems(entry.items);
        }
      }
    }).catch(() => {
      // Cache read failure is non-critical
    });
  }, [setItems]);

  // Full vault parse (used for both initial load and manual refresh)
  const loadVault = useCallback(async () => {
    if (isLoading) return;
    setLoading(true);
    setError(null);

    try {
      const freshItems: typeof items = [];

      await parseVault(fs, {
        folders: vaultConfig.folders,
        onBatch: (batchItems) => {
          freshItems.push(...batchItems);
        },
      });

      // Compare with current store items
      const currentItems = useLibraryStore.getState().items;
      if (currentItems.length === 0 || itemsHaveChanged(currentItems, freshItems)) {
        setItems(freshItems);
      }

      // Always update cache with fresh data
      saveCachedItems(freshItems).catch(() => { /* non-critical */ });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to load vault:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [fs, vaultConfig, isLoading, setItems, setLoading, setError]);

  // Phase 2: Background re-parse when filesystem is ready
  useEffect(() => {
    if (isRestoring || autoLoaded.current) return;
    if (isReady) {
      autoLoaded.current = true;
      loadVault();
    }
  }, [isReady, isRestoring, loadVault]);

  return { loadVault };
}
