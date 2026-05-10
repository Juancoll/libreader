/**
 * Shared item grid/list rendering used by LibraryPage and FolderPage.
 *
 * Reads viewMode, isLoading, and error from the store directly,
 * so callers only pass data-specific props.
 */
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';
import type { FSAdapter } from '@/services/vaultParser';
import { FilterBar } from './FilterBar';
import { BookCard, BookListItem } from './BookCard';

interface ItemGridProps {
  items: LibraryItem[];
  fs: FSAdapter | null;
  hasAnyItems: boolean;
  emptyMessage: string;
  /** Passed to FilterBar for folder-scoped filtering */
  folderName?: string;
  /** Passed to FilterBar for collection-scoped filtering */
  collectionId?: string;
  /** Optional content rendered between filters and grid (e.g. folder breakdown) */
  children?: React.ReactNode;
}

export function ItemGrid({ items, fs, hasAnyItems, emptyMessage, folderName, collectionId, children }: ItemGridProps) {
  const viewMode = useLibraryStore((s) => s.viewMode);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const storeError = useLibraryStore((s) => s.error);

  const hasItems = items.length > 0;

  return (
    <>
      {/* Error */}
      {storeError && (
        <div className="p-3 rounded-lg bg-danger/10 text-danger text-sm">
          {storeError}
        </div>
      )}

      {/* Filters — show as soon as we have any items */}
      {hasAnyItems && <FilterBar folderName={folderName} collectionId={collectionId} />}

      {/* Initial loading with no items yet — centered spinner */}
      {isLoading && !hasAnyItems && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-muted">Leyendo vault...</p>
          </div>
        </div>
      )}

      {/* No results after filters (but source has items) */}
      {!isLoading && !hasItems && hasAnyItems && (
        <div className="text-center py-20 text-text-muted">
          No se encontraron resultados con los filtros actuales.
        </div>
      )}

      {/* Empty source */}
      {!isLoading && !hasAnyItems && !storeError && (
        <div className="text-center py-20 text-text-muted">
          {emptyMessage}
        </div>
      )}

      {/* Extra content slot (e.g. folder breakdown in LibraryPage) */}
      {children}

      {/* Items grid/list */}
      {hasItems && (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item) => (
              <BookCard key={item.id} item={item} fs={fs} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <BookListItem key={item.id} item={item} fs={fs} />
            ))}
          </div>
        )
      )}

      {/* Inline loading indicator when items are already showing */}
      {isLoading && hasItems && (
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Actualizando biblioteca...</span>
          </div>
        </div>
      )}
    </>
  );
}
