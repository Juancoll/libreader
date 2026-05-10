import { useMemo } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem } from '@/types';

interface UseFilteredItemsOptions {
  /** Only include items from this specific folder name */
  folderName?: string;
  /** Only include items from folders with showInLibrary=true */
  libraryOnly?: boolean;
  /** Only include child items of this collection ID */
  collectionId?: string;
  /** If true, include items that belong to a collection (normally hidden) */
  includeCollectionChildren?: boolean;
}

/**
 * Hook that returns the filtered and sorted library items.
 * Can be scoped to a specific folder or to showInLibrary folders only.
 */
export function useFilteredItems(options?: UseFilteredItemsOptions): LibraryItem[] {
  const items = useLibraryStore((s) => s.items);
  const filter = useLibraryStore((s) => s.filter);
  const sort = useLibraryStore((s) => s.sort);
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);

  const folderName = options?.folderName;
  const libraryOnly = options?.libraryOnly;
  const collectionId = options?.collectionId;
  const includeCollectionChildren = options?.includeCollectionChildren;

  return useMemo(() => {
    let result = [...items];

    // If viewing a specific collection, show only its children
    if (collectionId) {
      result = result.filter((item) => item.parentCollectionId === collectionId);
    } else if (!includeCollectionChildren) {
      // By default, hide items that belong to a collection (they appear inside their collection page)
      result = result.filter((item) => !item.parentCollectionId);
    }

    // Scope to showInLibrary folders
    if (libraryOnly) {
      const libraryFolders = new Set(
        vaultConfig.folders.filter((f) => f.showInLibrary !== false).map((f) => f.name)
      );
      result = result.filter((item) =>
        item.folder ? libraryFolders.has(item.folder) : true
      );
    }

    // Scope to specific folder
    if (folderName) {
      result = result.filter((item) => item.folder === folderName);
    }

    // Apply filters
    if (filter.status && filter.status.length > 0) {
      result = result.filter((item) => filter.status!.includes(item.status));
    }

    if (filter.folders && filter.folders.length > 0) {
      result = result.filter((item) =>
        item.folder ? filter.folders!.includes(item.folder) : false
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      result = result.filter((item) =>
        filter.tags!.some((tag) => item.tags.includes(tag))
      );
    }

    if (filter.authors && filter.authors.length > 0) {
      result = result.filter((item) =>
        filter.authors!.some((author) => item.authors.includes(author))
      );
    }

    if (filter.formats && filter.formats.length > 0) {
      result = result.filter((item) =>
        filter.formats!.some((fmt) => item.formats.includes(fmt))
      );
    }

    if (filter.language) {
      result = result.filter((item) => item.language === filter.language);
    }

    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle?.toLowerCase().includes(q) ||
          item.authors.some((a) => a.toLowerCase().includes(q)) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'author':
          cmp = (a.authors[0] || '').localeCompare(b.authors[0] || '');
          break;
        case 'year':
          cmp = (a.year || '').localeCompare(b.year || '');
          break;
        case 'rating':
          cmp = (a.rating || 0) - (b.rating || 0);
          break;
        case 'progress':
          cmp = (a.progress || 0) - (b.progress || 0);
          break;
        case 'dateStarted':
          cmp = (a.dateStarted || '').localeCompare(b.dateStarted || '');
          break;
        case 'lastRead':
          cmp = (a.lastRead || '').localeCompare(b.lastRead || '');
          break;
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [items, filter, sort, vaultConfig, folderName, libraryOnly, collectionId, includeCollectionChildren]);
}
