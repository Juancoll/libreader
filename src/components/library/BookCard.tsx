import { Link } from 'react-router-dom';
import type { LibraryItem } from '@/types';
import type { FSAdapter } from '@/services/vaultParser';
import { useCoverUrl } from '@/hooks/useCoverUrl';

interface BookCardProps {
  item: LibraryItem;
  fs: FSAdapter | null;
}

const statusColors: Record<string, string> = {
  'to-read': 'bg-text-muted',
  reading: 'bg-primary',
  finished: 'bg-success',
  abandoned: 'bg-danger',
};

const statusLabels: Record<string, string> = {
  'to-read': 'Por leer',
  reading: 'Leyendo',
  finished: 'Terminado',
  abandoned: 'Abandonado',
};

/** Derive a placeholder icon from the item's file formats. */
function formatIcon(formats: string[]): string {
  if (formats.some((f) => f === 'cbz' || f === 'cbr')) return 'C';
  if (formats.some((f) => f === 'pdf')) return 'P';
  if (formats.some((f) => f === 'epub')) return 'B';
  if (formats.some((f) => f === 'md')) return 'N';
  return '?';
}

/** Whether the item looks like a comic based on its formats. */
function isComic(item: LibraryItem): boolean {
  return item.formats.some((f) => f === 'cbz' || f === 'cbr');
}

export function BookCard({ item, fs }: BookCardProps) {
  const archivePath = !item.cover && isComic(item)
    ? (item.filePaths.cbz || undefined)
    : undefined;
  const coverUrl = useCoverUrl(fs, item.cover, archivePath);

  const linkTo = item.isCollection
    ? `/collection/${encodeURIComponent(item.id)}`
    : `/item/${encodeURIComponent(item.id)}`;

  return (
    <Link
      to={linkTo}
      className="group flex flex-col rounded-xl overflow-hidden border border-border bg-surface hover:shadow-lg hover:border-primary/30 transition-all duration-200"
    >
      {/* Cover */}
      <div className="relative aspect-[2/3] bg-surface-alt overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-light">
            <span className="text-4xl font-bold text-primary opacity-50">
              {item.isCollection ? 'S' : formatIcon(item.formats)}
            </span>
          </div>
        )}

        {/* Collection badge (top-left) */}
        {item.isCollection && (
          <div className="absolute top-2 left-2">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-accent/90 text-white">
              {item.childCount ?? item.volumesOwned ?? '?'} vol.
            </span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[item.status]}`}
            title={statusLabels[item.status]}
          />
        </div>

        {/* Progress bar */}
        {item.progress !== undefined && item.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(item.progress, 100)}%` }}
            />
          </div>
        )}

        {/* Progress percentage badge */}
        {item.progress !== undefined && item.progress > 0 && !item.isCollection && (
          <div className="absolute top-2 left-2">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/90 text-white tabular-nums">
              {item.progress}%
            </span>
          </div>
        )}

        {/* Format badges */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          {item.formats.map((fmt) => (
            <span
              key={fmt}
              className="px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded bg-black/60 text-white"
            >
              {fmt}
            </span>
          ))}
        </div>

        {/* Collection stacked effect */}
        {item.isCollection && (
          <div className="absolute inset-x-1 -bottom-0.5 h-2 rounded-b-xl bg-border/50 -z-10" />
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-text leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h3>
        {item.authors.length > 0 && (
          <p className="text-xs text-text-secondary line-clamp-1">
            {item.authors.join(', ')}
          </p>
        )}
        {item.isCollection && item.volumesCount && (
          <p className="text-xs text-text-muted">
            {item.volumesOwned ?? '?'}/{item.volumesCount} vol.
          </p>
        )}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-alt text-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

// ---- List variant ----

export function BookListItem({ item, fs }: BookCardProps) {
  const archivePath = !item.cover && isComic(item)
    ? (item.filePaths.cbz || undefined)
    : undefined;
  const coverUrl = useCoverUrl(fs, item.cover, archivePath);

  const linkTo = item.isCollection
    ? `/collection/${encodeURIComponent(item.id)}`
    : `/item/${encodeURIComponent(item.id)}`;

  return (
    <Link
      to={linkTo}
      className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-surface-hover hover:border-primary/30 transition-all"
    >
      {/* Cover thumbnail */}
      <div className="w-12 h-16 rounded overflow-hidden bg-surface-alt shrink-0">
        {coverUrl ? (
          <img src={coverUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-light">
            <span className="text-lg font-bold text-primary opacity-50">
              {item.isCollection ? 'S' : formatIcon(item.formats)}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-text truncate">{item.title}</h3>
        {item.authors.length > 0 && (
          <p className="text-xs text-text-secondary truncate">
            {item.authors.join(', ')}
          </p>
        )}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-alt text-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 shrink-0">
        {item.isCollection && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-accent/90 text-white">
            {item.childCount ?? item.volumesOwned ?? '?'} vol.
          </span>
        )}
        {item.progress !== undefined && item.progress > 0 && (
          <span className="text-xs text-primary font-medium">{item.progress}%</span>
        )}
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[item.status]}`}
          title={statusLabels[item.status]}
        />
        <div className="flex gap-1">
          {item.formats.map((fmt) => (
            <span
              key={fmt}
              className="px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded bg-surface-alt text-text-muted"
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
