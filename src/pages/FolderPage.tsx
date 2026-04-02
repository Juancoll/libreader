import { useCallback, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLibraryStore } from '@/store/libraryStore';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useFilteredItems } from '@/hooks/useFilteredItems';
import { useVaultLoader } from '@/hooks/useVaultLoader';
import { ItemGrid } from '@/components/library/ItemGrid';

export function FolderPage() {
  const { slug } = useParams<{ slug: string }>();
  const { fs, isReady, isRestoring } = useFileSystem();
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const allItems = useLibraryStore((s) => s.items);
  const { loadVault } = useVaultLoader();
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Find folder config by slug (path used as slug)
  const folder = vaultConfig.folders.find((f) => f.path === slug);
  const folderItems = useFilteredItems(folder ? { folderName: folder.name } : undefined);

  // Total items in this folder (before user filters)
  const folderTotal = useMemo(() => {
    if (!folder) return 0;
    return allItems.filter((item) => item.folder === folder.name).length;
  }, [allItems, folder]);

  const handleReload = useCallback(async () => {
    const start = performance.now();
    await loadVault();
    setLoadTime(Math.round(performance.now() - start));
  }, [loadVault]);

  if (!folder) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold text-text">Carpeta no encontrada</h2>
          <p className="text-text-secondary">
            No existe una carpeta configurada con ruta: {slug}
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors"
          >
            Volver a la biblioteca
          </Link>
        </div>
      </div>
    );
  }

  // Restoring saved handle
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

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-text">{folder.name}</h2>
          <p className="text-text-secondary">
            Conecta un vault para ver el contenido.
          </p>
        </div>
      </div>
    );
  }

  const hasAnyItems = folderTotal > 0;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text">{folder.name}</h2>
          <p className="text-sm text-text-secondary">
            {folderTotal > 0 && (
              <span>
                {folderTotal} items
                {folderItems.length !== folderTotal && ` (${folderItems.length} filtrados)`}
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
        items={folderItems}
        fs={fs}
        hasAnyItems={hasAnyItems}
        emptyMessage="No hay items en esta carpeta."
        folderName={folder.name}
      />
    </div>
  );
}
