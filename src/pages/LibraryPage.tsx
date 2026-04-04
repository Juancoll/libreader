import { useCallback, useMemo, useState } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useFilteredItems } from '@/hooks/useFilteredItems';
import { useVaultLoader } from '@/hooks/useVaultLoader';
import { ItemGrid } from '@/components/library/ItemGrid';

export function LibraryPage() {
  const { fs, isReady, isRestoring, rootName, error: fsError, requestAccess, isNative, setNativeVaultPath, getNativeVaultPath } = useFileSystem();
  const items = useFilteredItems({ libraryOnly: true });
  const allItems = useLibraryStore((s) => s.items);
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const { loadVault } = useVaultLoader();
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [nativePath, setNativePath] = useState(getNativeVaultPath());

  // Total items in showInLibrary folders (before user filters)
  const libraryTotal = useMemo(() => {
    const libraryFolders = new Set(
      vaultConfig.folders.filter((f) => f.showInLibrary !== false).map((f) => f.name)
    );
    return allItems.filter((item) => item.folder ? libraryFolders.has(item.folder) : true).length;
  }, [allItems, vaultConfig]);

  const handleReload = useCallback(async () => {
    const start = performance.now();
    await loadVault();
    setLoadTime(Math.round(performance.now() - start));
  }, [loadVault]);

  const handleOpenVault = useCallback(async () => {
    if (isNative) {
      const ok = await setNativeVaultPath(nativePath);
      if (ok) {
        await handleReload();
      }
    } else {
      const ok = await requestAccess();
      if (ok) {
        await handleReload();
      }
    }
  }, [isNative, nativePath, requestAccess, setNativeVaultPath, handleReload]);

  // Whether we have items to show (even while still loading more)
  const hasAnyItems = allItems.length > 0;

  // Folder breakdown label (memoized to avoid recalculating on every render)
  const folderBreakdown = useMemo(() => {
    if (!hasAnyItems) return '';
    const folders = allItems.reduce((acc, item) => {
      const key = item.folder || 'sin carpeta';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(folders).map(([f, c]) => `${f}: ${c}`).join(' | ');
  }, [allItems, hasAnyItems]);

  // Restoring saved handle - show loading indicator
  if (isRestoring) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-secondary">Reconectando al vault...</p>
        </div>
      </div>
    );
  }

  // Not connected - show welcome screen
  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md space-y-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-primary-light flex items-center justify-center">
            <svg className="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-text">Bienvenido a LibReader</h2>
            <p className="mt-2 text-text-secondary">
              {isNative
                ? 'Ingresa la ruta de tu vault de Obsidian en el dispositivo.'
                : 'Selecciona tu vault de Obsidian para comenzar a explorar tu biblioteca.'}
            </p>
          </div>
          {isNative && (
            <input
              type="text"
              value={nativePath}
              onChange={(e) => setNativePath(e.target.value)}
              placeholder="/storage/emulated/0/Documents/library"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background text-text font-mono text-sm focus:outline-none focus:border-primary"
            />
          )}
          <button
            onClick={handleOpenVault}
            disabled={isNative && !nativePath.trim()}
            className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50"
          >
            {isNative ? 'Conectar Vault' : 'Abrir Vault de Obsidian'}
          </button>
          {fsError && (
            <p className="text-sm text-danger">{fsError}</p>
          )}
          <p className="text-xs text-text-muted">
            {isNative
              ? 'Ingresa la ruta completa del directorio. Los archivos se leen localmente, no se sube nada.'
              : 'Se necesita acceso al directorio para leer los archivos de tu biblioteca. No se sube nada a ningun servidor.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text">Biblioteca</h2>
          <p className="text-sm text-text-secondary">
            {rootName && <span className="font-mono text-text-muted">{rootName}</span>}
            {libraryTotal > 0 && (
              <span>
                {' '}&middot; {libraryTotal} items
                {items.length !== libraryTotal && ` (${items.length} filtrados)`}
              </span>
            )}
            {isLoading && (
              <span className="text-text-muted"> &middot; cargando...</span>
            )}
            {!isLoading && loadTime !== null && (
              <span className="text-text-muted"> &middot; {loadTime}ms</span>
            )}
          </p>
        </div>
        <button
          onClick={handleReload}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Cargando...' : 'Recargar'}
        </button>
      </div>

      <ItemGrid
        items={items}
        fs={fs}
        hasAnyItems={hasAnyItems}
        emptyMessage="El vault esta vacio o no se pudieron cargar los items."
      >
        {/* Folder breakdown */}
        {folderBreakdown && (
          <div className="text-xs text-text-muted px-1">
            {folderBreakdown}
          </div>
        )}
      </ItemGrid>
    </div>
  );
}
