import { useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLibraryStore } from '@/store/libraryStore';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useFilteredItems } from '@/hooks/useFilteredItems';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import { ItemGrid } from '@/components/library/ItemGrid';

export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { fs } = useFileSystem();
  const allItems = useLibraryStore((s) => s.items);

  const collection = useMemo(
    () => allItems.find((item) => item.id === id && item.isCollection),
    [allItems, id]
  );

  const childItems = useFilteredItems(
    collection ? { collectionId: collection.id } : undefined
  );

  const coverUrl = useCoverUrl(fs, collection?.cover);

  if (!collection) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold text-text">Coleccion no encontrada</h2>
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

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Collection header */}
      <div className="flex gap-6 items-start">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="mt-1 p-2 rounded-lg text-text-muted hover:bg-surface-hover hover:text-text transition-colors shrink-0"
          title="Volver"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {/* Cover */}
        <div className="w-32 h-48 rounded-lg overflow-hidden bg-surface-alt shrink-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={collection.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary-light">
              <span className="text-3xl font-bold text-primary opacity-50">S</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <h1 className="text-2xl font-bold text-text">{collection.title}</h1>
          {collection.authors.length > 0 && (
            <p className="text-sm text-text-secondary">
              {collection.authors.join(', ')}
            </p>
          )}
          <div className="flex flex-wrap gap-3 text-sm text-text-muted">
            {collection.yearStart && (
              <span>
                {collection.yearStart}
                {collection.yearEnd && collection.yearEnd !== collection.yearStart
                  ? `–${collection.yearEnd}`
                  : ''}
              </span>
            )}
            {collection.volumesCount && (
              <span>
                {collection.volumesOwned ?? childItems.length}/{collection.volumesCount} vol.
              </span>
            )}
            {!collection.volumesCount && childItems.length > 0 && (
              <span>{childItems.length} items</span>
            )}
          </div>
          {collection.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {collection.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs rounded-full bg-surface-alt text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Child items grid */}
      <ItemGrid
        items={childItems}
        fs={fs}
        hasAnyItems={childItems.length > 0}
        emptyMessage="No hay items en esta coleccion."
        collectionId={collection.id}
      />
    </div>
  );
}
