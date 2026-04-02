import { useState, useEffect, useCallback, useRef } from 'react';
import { WebFSAdapter } from '@/services/vaultParser';

const fsAdapter = new WebFSAdapter();

/**
 * Hook to manage filesystem access and provide the adapter.
 * On mount, tries to restore a previously saved directory handle from IndexedDB
 * so the user doesn't have to re-select the vault on every page load.
 */
export function useFileSystem() {
  const [isReady, setIsReady] = useState(fsAdapter.isReady());
  const [rootName, setRootName] = useState(fsAdapter.getRootName());
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const restoreAttempted = useRef(false);

  // Try to restore saved handle on mount
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
      setError('No se pudo acceder al directorio. Intenta de nuevo.');
    }
    return ok;
  }, []);

  const disconnect = useCallback(async () => {
    await fsAdapter.disconnect();
    setIsReady(false);
    setRootName('');
  }, []);

  useEffect(() => {
    return () => {
      fsAdapter.cleanup();
    };
  }, []);

  return {
    fs: fsAdapter,
    isReady,
    isRestoring,
    rootName,
    error,
    requestAccess,
    disconnect,
  };
}
