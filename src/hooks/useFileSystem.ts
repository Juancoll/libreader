import { useState, useEffect, useCallback, useRef } from 'react';
import { WebFSAdapter } from '@/services/vaultParser';
import { CapacitorFSAdapter, isCapacitorNative } from '@/services/capacitorFS';
import type { FSAdapter } from '@/services/vaultParser';

/**
 * Unified adapter interface that both Web and Capacitor adapters implement.
 * Extends FSAdapter with lifecycle methods needed by the hook.
 */
interface ManagedFSAdapter extends FSAdapter {
  requestAccess(): Promise<boolean>;
  tryRestore(): Promise<boolean>;
  disconnect(): Promise<void>;
  isReady(): boolean;
  getRootName(): string;
  cleanup(): void;
}

/** True if running inside Capacitor native shell (Android/iOS). */
const isNative = isCapacitorNative();

/**
 * Create the singleton adapter based on platform.
 * On native: CapacitorFSAdapter (reads from device filesystem).
 * On web: WebFSAdapter (uses File System Access API + IndexedDB).
 */
const fsAdapter: ManagedFSAdapter = isNative
  ? new CapacitorFSAdapter()
  : new WebFSAdapter();

/**
 * Hook to manage filesystem access and provide the adapter.
 * On mount, tries to restore a previously saved directory handle (web) or
 * vault path (native) so the user doesn't have to re-select on every page load.
 */
export function useFileSystem() {
  const [isReady, setIsReady] = useState(fsAdapter.isReady());
  const [rootName, setRootName] = useState(fsAdapter.getRootName());
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const restoreAttempted = useRef(false);

  // Try to restore saved handle/path on mount
  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    if (fsAdapter.isReady()) {
      setIsRestoring(false);
      return;
    }

    fsAdapter.tryRestore().then((ok) => {
      if (ok) {
        setIsReady(true);
        setRootName(fsAdapter.getRootName());
      }
      setIsRestoring(false);
    }).catch(() => {
      setIsRestoring(false);
    });
  }, []);

  const requestAccess = useCallback(async () => {
    setError(null);
    const ok = await fsAdapter.requestAccess();
    if (ok) {
      setIsReady(true);
      setRootName(fsAdapter.getRootName());
    } else {
      setError(
        isNative
          ? 'No se pudo acceder a la ruta del vault. Verifica que existe y tiene permisos.'
          : 'No se pudo acceder al directorio. Intenta de nuevo.'
      );
    }
    return ok;
  }, []);

  const disconnect = useCallback(async () => {
    await fsAdapter.disconnect();
    setIsReady(false);
    setRootName('');
  }, []);

  /**
   * Native-only: Set vault path and validate access.
   * Returns true if the path is valid and accessible.
   */
  const setNativeVaultPath = useCallback(async (path: string) => {
    setError(null);
    if (!(fsAdapter instanceof CapacitorFSAdapter)) {
      return false;
    }
    const ok = await fsAdapter.setVaultPath(path);
    if (ok) {
      setIsReady(true);
      setRootName(fsAdapter.getRootName());
    } else {
      setError('No se pudo acceder a la ruta. Verifica que el directorio existe.');
    }
    return ok;
  }, []);

  /**
   * Native-only: Get the currently configured vault path.
   */
  const getNativeVaultPath = useCallback(() => {
    if (fsAdapter instanceof CapacitorFSAdapter) {
      return fsAdapter.getVaultPath();
    }
    return '';
  }, []);

  useEffect(() => {
    return () => {
      fsAdapter.cleanup();
    };
  }, []);

  return {
    fs: fsAdapter as FSAdapter,
    isReady,
    isRestoring,
    rootName,
    error,
    isNative,
    requestAccess,
    disconnect,
    setNativeVaultPath,
    getNativeVaultPath,
  };
}
