import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLibraryStore } from '@/store/libraryStore';
import type { LibraryItem, ReadingStatus } from '@/types';

const STATUS_LABELS: Record<ReadingStatus, string> = {
  'to-read': 'Por leer',
  reading: 'Leyendo',
  finished: 'Terminado',
  abandoned: 'Abandonado',
};

const STATUS_COLORS: Record<ReadingStatus, string> = {
  'to-read': 'bg-text-muted',
  reading: 'bg-primary',
  finished: 'bg-success',
  abandoned: 'bg-danger',
};

/** Relative time label for lastRead dates */
function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} dias`;
    if (days < 30) return `Hace ${Math.floor(days / 7)} semanas`;
    if (days < 365) return `Hace ${Math.floor(days / 30)} meses`;
    return `Hace ${Math.floor(days / 365)} anos`;
  } catch {
    return '';
  }
}

export function StatsPage() {
  const items = useLibraryStore((s) => s.items);

  const stats = useMemo(() => computeStats(items), [items]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <p className="text-text-secondary">No hay items en la biblioteca.</p>
          <Link
            to="/"
            className="text-primary hover:underline text-sm"
          >
            Ir a la biblioteca
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl">
      <h2 className="text-xl font-bold text-text">Estadisticas</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={stats.total} />
        <SummaryCard label="Terminados" value={stats.byStatus.finished} accent="text-success" />
        <SummaryCard label="Leyendo" value={stats.byStatus.reading} accent="text-primary" />
        <SummaryCard label="Por leer" value={stats.byStatus['to-read']} accent="text-text-muted" />
      </div>

      {/* Status breakdown + Folders side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <Card title="Por estado">
          <div className="space-y-3">
            {(Object.keys(STATUS_LABELS) as ReadingStatus[]).map((status) => {
              const count = stats.byStatus[status];
              if (count === 0) return null;
              const pct = Math.round((count / stats.total) * 100);
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{STATUS_LABELS[status]}</span>
                    <span className="text-text font-medium">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_COLORS[status]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Folders */}
        <Card title="Por carpeta">
          <div className="space-y-3">
            {stats.byFolder.map(({ name, count }) => {
              const pct = Math.round((count / stats.total) * 100);
              return (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{name}</span>
                    <span className="text-text font-medium">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Progress distribution + Ratings side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress distribution */}
        <Card title="Distribucion de progreso">
          <div className="space-y-3">
            {stats.progressBuckets.map(({ label, count }) => {
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{label}</span>
                    <span className="text-text font-medium">{count}</span>
                  </div>
                  <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-secondary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Ratings */}
        {stats.ratedCount > 0 && (
          <Card title={`Valoraciones (${stats.ratedCount} items)`}>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = stats.byRating[star] || 0;
                const pct = stats.ratedCount > 0 ? Math.round((count / stats.ratedCount) * 100) : 0;
                return (
                  <div key={star}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-text-secondary">
                        {'★'.repeat(star)}{'☆'.repeat(5 - star)}
                      </span>
                      <span className="text-text font-medium">{count}</span>
                    </div>
                    <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 text-sm text-text-muted">
                Promedio: {stats.avgRating.toFixed(1)} ★
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Top authors + Top tags side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top authors */}
        {stats.topAuthors.length > 0 && (
          <Card title="Autores mas frecuentes">
            <div className="space-y-2">
              {stats.topAuthors.map(({ name, count }) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-text truncate mr-2">{name}</span>
                  <span className="text-text-muted shrink-0">{count} {count === 1 ? 'item' : 'items'}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Top tags */}
        {stats.topTags.length > 0 && (
          <Card title="Tags mas usados">
            <div className="flex flex-wrap gap-2">
              {stats.topTags.map(({ name, count }) => (
                <span
                  key={name}
                  className="px-2.5 py-1 bg-surface-alt text-text-secondary rounded-full text-xs font-medium"
                >
                  {name} ({count})
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Recently read */}
      {stats.recentlyRead.length > 0 && (
        <Card title="Leido recientemente">
          <div className="space-y-2">
            {stats.recentlyRead.map((item) => (
              <Link
                key={item.id}
                to={`/item/${item.id}`}
                className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-surface-hover transition-colors -mx-1"
              >
                <div className="min-w-0">
                  <div className="text-sm text-text font-medium truncate">{item.title}</div>
                  {item.authors.length > 0 && (
                    <div className="text-xs text-text-muted truncate">
                      {item.authors.join(', ')}
                    </div>
                  )}
                </div>
                <div className="text-xs text-text-muted shrink-0 ml-3">
                  {item.lastRead && timeAgo(item.lastRead)}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Year started timeline */}
      {stats.byYearStarted.length > 0 && (
        <Card title="Inicio de lectura por ano">
          <div className="space-y-3">
            {stats.byYearStarted.map(({ year, count }) => {
              const maxCount = stats.byYearStarted[0].count;
              const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              return (
                <div key={year}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">{year}</span>
                    <span className="text-text font-medium">{count}</span>
                  </div>
                  <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Formats */}
      <Card title="Formatos">
        <div className="flex flex-wrap gap-3">
          {stats.byFormat.map(({ format, count }) => (
            <div
              key={format}
              className="px-4 py-2 bg-surface-alt rounded-lg text-center"
            >
              <div className="text-lg font-bold text-text">{count}</div>
              <div className="text-xs text-text-muted uppercase">{format}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---- Sub-components ----

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="p-4 bg-surface-alt rounded-xl border border-border">
      <div className={`text-2xl font-bold ${accent || 'text-text'}`}>{value}</div>
      <div className="text-xs text-text-muted mt-1">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-surface rounded-xl border border-border">
      <h3 className="text-sm font-semibold text-text mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ---- Stats computation ----

interface Stats {
  total: number;
  byStatus: Record<ReadingStatus, number>;
  byFolder: { name: string; count: number }[];
  topAuthors: { name: string; count: number }[];
  topTags: { name: string; count: number }[];
  byRating: Record<number, number>;
  ratedCount: number;
  avgRating: number;
  progressBuckets: { label: string; count: number }[];
  recentlyRead: LibraryItem[];
  byYearStarted: { year: string; count: number }[];
  byFormat: { format: string; count: number }[];
}

function computeStats(items: LibraryItem[]): Stats {
  const total = items.length;

  // By status
  const byStatus: Record<ReadingStatus, number> = {
    'to-read': 0,
    reading: 0,
    finished: 0,
    abandoned: 0,
  };
  for (const item of items) {
    byStatus[item.status]++;
  }

  // By folder
  const folderMap = new Map<string, number>();
  for (const item of items) {
    const f = item.folder || 'Sin carpeta';
    folderMap.set(f, (folderMap.get(f) || 0) + 1);
  }
  const byFolder = [...folderMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Top authors
  const authorMap = new Map<string, number>();
  for (const item of items) {
    for (const author of item.authors) {
      authorMap.set(author, (authorMap.get(author) || 0) + 1);
    }
  }
  const topAuthors = [...authorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Top tags
  const tagMap = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }
  const topTags = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  // Ratings
  const byRating: Record<number, number> = {};
  let ratingSum = 0;
  let ratedCount = 0;
  for (const item of items) {
    if (item.rating && item.rating > 0) {
      const r = Math.round(item.rating);
      byRating[r] = (byRating[r] || 0) + 1;
      ratingSum += item.rating;
      ratedCount++;
    }
  }
  const avgRating = ratedCount > 0 ? ratingSum / ratedCount : 0;

  // Progress distribution
  const buckets = [
    { label: 'Sin empezar (0%)', min: 0, max: 0 },
    { label: '1-25%', min: 1, max: 25 },
    { label: '26-50%', min: 26, max: 50 },
    { label: '51-75%', min: 51, max: 75 },
    { label: '76-99%', min: 76, max: 99 },
    { label: 'Completado (100%)', min: 100, max: 100 },
  ];
  const progressBuckets = buckets.map(({ label, min, max }) => ({
    label,
    count: items.filter((item) => {
      const p = item.progress ?? 0;
      return p >= min && p <= max;
    }).length,
  }));

  // Recently read (items with lastRead, sorted newest first)
  const recentlyRead = items
    .filter((item) => item.lastRead)
    .sort((a, b) => (b.lastRead || '').localeCompare(a.lastRead || ''))
    .slice(0, 10);

  // By year started
  const yearMap = new Map<string, number>();
  for (const item of items) {
    if (item.dateStarted) {
      const year = item.dateStarted.substring(0, 4);
      if (year && /^\d{4}$/.test(year)) {
        yearMap.set(year, (yearMap.get(year) || 0) + 1);
      }
    }
  }
  const byYearStarted = [...yearMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, count]) => ({ year, count }));

  // By format
  const formatMap = new Map<string, number>();
  for (const item of items) {
    for (const fmt of item.formats) {
      formatMap.set(fmt, (formatMap.get(fmt) || 0) + 1);
    }
  }
  const byFormat = [...formatMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([format, count]) => ({ format, count }));

  return {
    total,
    byStatus,
    byFolder,
    topAuthors,
    topTags,
    byRating,
    ratedCount,
    avgRating,
    progressBuckets,
    recentlyRead,
    byYearStarted,
    byFormat,
  };
}

export default StatsPage;
