import { useState, useEffect, useMemo } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import type { ReadingStatus } from '@/types';

const statuses: { value: ReadingStatus; label: string }[] = [
  { value: 'to-read', label: 'Por leer' },
  { value: 'reading', label: 'Leyendo' },
  { value: 'finished', label: 'Terminado' },
  { value: 'abandoned', label: 'Abandonado' },
];

interface FilterBarProps {
  /** When set, scope tag/status counts to this folder and hide folder chips */
  folderName?: string;
}

export function FilterBar({ folderName }: FilterBarProps = {}) {
  const filter = useLibraryStore((s) => s.filter);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const clearFilters = useLibraryStore((s) => s.clearFilters);
  const viewMode = useLibraryStore((s) => s.viewMode);
  const setViewMode = useLibraryStore((s) => s.setViewMode);
  const sort = useLibraryStore((s) => s.sort);
  const setSort = useLibraryStore((s) => s.setSort);
  const items = useLibraryStore((s) => s.items);
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);

  // Debounced search: local state updates instantly, store updates after 250ms
  const [searchText, setSearchText] = useState(filter.search || '');
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter({ search: searchText || undefined });
    }, 250);
    return () => clearTimeout(t);
  }, [searchText, setFilter]);

  // Sync local state when store filter is cleared externally
  useEffect(() => {
    if (!filter.search && searchText) setSearchText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.search]);

  // Scope items: either a specific folder, or all showInLibrary folders
  const scopedItems = useMemo(() => {
    if (folderName) return items.filter((i) => i.folder === folderName);
    const libraryFolderNames = new Set(
      vaultConfig.folders.filter((f) => f.showInLibrary !== false).map((f) => f.name)
    );
    return items.filter((i) => i.folder ? libraryFolderNames.has(i.folder) : true);
  }, [items, folderName, vaultConfig.folders]);

  // Collect all unique tags from scoped items
  const allTags = [...new Set(scopedItems.flatMap((i) => i.tags))].sort();

  // Collect all folders that actually have items (only for library-wide view)
  const folderCounts = new Map<string, number>();
  if (!folderName) {
    for (const item of scopedItems) {
      if (item.folder) {
        folderCounts.set(item.folder, (folderCounts.get(item.folder) || 0) + 1);
      }
    }
  }
  // Keep folder order from config, only showing ones with items and showInLibrary
  const activeFolders = folderName
    ? []
    : vaultConfig.folders
        .filter((f) => f.showInLibrary !== false && folderCounts.has(f.name))
        .map((f) => ({ name: f.name, count: folderCounts.get(f.name)! }));

  const toggleFolder = (name: string) => {
    const current = filter.folders || [];
    const next = current.includes(name)
      ? current.filter((f) => f !== name)
      : [...current, name];
    setFilter({ folders: next.length > 0 ? next : undefined });
  };

  const toggleStatus = (status: ReadingStatus) => {
    const current = filter.status || [];
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    setFilter({ status: next.length > 0 ? next : undefined });
  };

  const hasFilters =
    (!folderName && filter.folders && filter.folders.length > 0) ||
    (filter.status && filter.status.length > 0) ||
    (filter.tags && filter.tags.length > 0) ||
    filter.search;

  return (
    <div className="space-y-3">
      {/* Search + View toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar por titulo, autor, tag..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Sort */}
        <select
          value={`${sort.field}-${sort.direction}`}
          onChange={(e) => {
            const [field, direction] = e.target.value.split('-') as [string, string];
            setSort({ field: field as any, direction: direction as any });
          }}
          className="px-3 py-2.5 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:border-primary"
        >
          <option value="title-asc">Titulo A-Z</option>
          <option value="title-desc">Titulo Z-A</option>
          <option value="author-asc">Autor A-Z</option>
          <option value="year-desc">Mas reciente</option>
          <option value="year-asc">Mas antiguo</option>
          <option value="progress-desc">Progreso</option>
          <option value="rating-desc">Valoracion</option>
          <option value="lastRead-desc">Ultima lectura</option>
        </select>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <ViewModeButton
            active={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            label="Grid"
          >
            <GridIcon className="w-4 h-4" />
          </ViewModeButton>
          <ViewModeButton
            active={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            label="List"
          >
            <ListIcon className="w-4 h-4" />
          </ViewModeButton>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {/* Folder filters (only in library-wide view) */}
        {activeFolders.map(({ name, count }) => (
          <FilterChip
            key={`folder-${name}`}
            label={`${name} (${count})`}
            active={filter.folders?.includes(name) ?? false}
            onClick={() => toggleFolder(name)}
          />
        ))}

        {activeFolders.length > 0 && statuses.some(({ value }) => scopedItems.some((i) => i.status === value)) && (
          <span className="w-px h-6 bg-border self-center" />
        )}

        {/* Status filters */}
        {statuses.map(({ value, label }) => {
          const count = scopedItems.filter((i) => i.status === value).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={value}
              label={`${label} (${count})`}
              active={filter.status?.includes(value) ?? false}
              onClick={() => toggleStatus(value)}
              variant="secondary"
            />
          );
        })}

        {hasFilters && (
          <>
            <span className="w-px h-6 bg-border self-center" />
            <button
              onClick={clearFilters}
              className="px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10 rounded-full transition-colors"
            >
              Limpiar filtros
            </button>
          </>
        )}
      </div>

      {/* Tag filter (collapsible) */}
      {allTags.length > 0 && (
        <details className="group">
          <summary className="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
            Tags ({allTags.length})
          </summary>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {allTags.map((tag) => (
              <FilterChip
                key={tag}
                label={tag}
                active={filter.tags?.includes(tag) ?? false}
                onClick={() => {
                  const current = filter.tags || [];
                  const next = current.includes(tag)
                    ? current.filter((t) => t !== tag)
                    : [...current, tag];
                  setFilter({ tags: next.length > 0 ? next : undefined });
                }}
                small
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ---- Sub-components ----

function FilterChip({
  label,
  active,
  onClick,
  small,
  variant = 'primary',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const activeClass =
    variant === 'secondary'
      ? 'bg-secondary text-white'
      : 'bg-primary text-white';
  const inactiveClass =
    variant === 'secondary'
      ? 'bg-secondary-light text-secondary hover:bg-secondary/20'
      : 'bg-surface-alt text-text-secondary hover:bg-surface-hover';

  return (
    <button
      onClick={onClick}
      className={`
        ${small ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}
        font-medium rounded-full transition-colors
        ${active ? activeClass : inactiveClass}
      `}
    >
      {label}
    </button>
  );
}

function ViewModeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-2 transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'bg-surface text-text-muted hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

// ---- Icons ----

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
