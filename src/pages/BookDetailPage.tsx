import { useState, lazy, Suspense, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLibraryStore } from '@/store/libraryStore';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import { MarkdownViewer } from '@/components/reader/MarkdownViewer';
import type { FileFormat, LibraryItem } from '@/types';
import type { FSAdapter } from '@/services/vaultParser';

// Lazy-load heavy reader components (epub.js ~400KB, pdf.js ~1MB, fflate ~40KB)
const EpubReader = lazy(() =>
  import('@/components/reader/EpubReader').then((m) => ({ default: m.EpubReader }))
);
const PdfReader = lazy(() =>
  import('@/components/reader/PdfReader').then((m) => ({ default: m.PdfReader }))
);
const ComicReader = lazy(() =>
  import('@/components/reader/ComicReader').then((m) => ({ default: m.ComicReader }))
);
const VideoReader = lazy(() =>
  import('@/components/reader/VideoReader').then((m) => ({ default: m.VideoReader }))
);

const statusLabels: Record<string, string> = {
  'to-read': 'Por leer',
  reading: 'Leyendo',
  finished: 'Terminado',
  abandoned: 'Abandonado',
};

const statusColors: Record<string, string> = {
  'to-read': 'bg-text-muted/20 text-text-muted',
  reading: 'bg-primary/20 text-primary',
  finished: 'bg-success/20 text-success',
  abandoned: 'bg-danger/20 text-danger',
};

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const items = useLibraryStore((s) => s.items);
  const { fs } = useFileSystem();

  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold text-text">Item no encontrado</h2>
          <p className="text-text-secondary">
            No se encontro el item con ID: {id}
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

  return <BookDetailContent item={item} fs={fs} />;
}

function BookDetailContent({
  item,
  fs,
}: {
  item: LibraryItem;
  fs: FSAdapter;
}) {
  const coverUrl = useCoverUrl(fs, item.cover);
  const setChatContext = useLibraryStore((s) => s.setChatContext);
  const clearChatContext = useLibraryStore((s) => s.clearChatContext);
  const [activeReader, setActiveReader] = useState<{
    format: FileFormat;
    path: string;
  } | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Set AI chat context when viewing a book
  useEffect(() => {
    setChatContext({
      bookId: item.id,
      bookTitle: item.title,
      bookAuthors: item.authors,
      bookTags: item.tags,
      format: item.formats?.[0],
    });
    return () => clearChatContext();
  }, [item.id, item.title, item.authors, item.tags, item.formats, setChatContext, clearChatContext]);

  const openReader = (format: FileFormat, path: string) => {
    setChatContext({ filePath: path, format });
    setActiveReader({ format, path });
  };

  const closeReader = () => {
    setChatContext({ filePath: undefined, selectedText: undefined });
    setActiveReader(null);
  };

  // Render active reader
  if (activeReader) {
    const readerFallback = (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-white/50">Cargando lector...</p>
        </div>
      </div>
    );

    switch (activeReader.format) {
      case 'epub':
        return (
          <Suspense fallback={readerFallback}>
            <EpubReader
              filePath={activeReader.path}
              fs={fs}
              onClose={closeReader}
            />
          </Suspense>
        );
      case 'pdf':
        return (
          <Suspense fallback={readerFallback}>
            <PdfReader
              filePath={activeReader.path}
              fs={fs}
              onClose={closeReader}
            />
          </Suspense>
        );
      case 'cbz':
      case 'cbr':
        return (
          <Suspense fallback={readerFallback}>
            <ComicReader
              filePath={activeReader.path}
              format={activeReader.format}
              fs={fs}
              onClose={closeReader}
            />
          </Suspense>
        );
      case 'youtube':
        return (
          <Suspense fallback={readerFallback}>
            <VideoReader
              filePath={activeReader.path}
              fs={fs}
              onClose={closeReader}
            />
          </Suspense>
        );
      default:
        break;
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Volver
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Cover */}
        <div className="w-48 shrink-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={item.title}
              className="w-full rounded-xl shadow-lg"
            />
          ) : (
            <div className="w-full aspect-[2/3] rounded-xl bg-primary-light flex items-center justify-center">
              <span className="text-6xl font-bold text-primary opacity-30">
                {item.formats.some((f) => f === 'cbz' || f === 'cbr') ? 'C' : 'B'}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-text">{item.title}</h1>
            {item.subtitle && (
              <p className="text-lg text-text-secondary mt-1">{item.subtitle}</p>
            )}
          </div>

          {item.authors.length > 0 && (
            <p className="text-text-secondary">
              {item.authors.join(', ')}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
              {statusLabels[item.status]}
            </span>
            {item.formats.map((fmt) => (
              <span
                key={fmt}
                className="px-3 py-1 rounded-full text-xs font-medium bg-surface-alt text-text-secondary uppercase"
              >
                {fmt}
              </span>
            ))}
          </div>

          {/* Progress */}
          {item.progress !== undefined && item.progress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Progreso de lectura</span>
                <span>{item.progress}%</span>
              </div>
              <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Metadata table */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {item.year && (
              <>
                <span className="text-text-muted">Ano</span>
                <span className="text-text">{item.year}</span>
              </>
            )}
            {item.publisher && (
              <>
                <span className="text-text-muted">Editorial</span>
                <span className="text-text">{item.publisher}</span>
              </>
            )}
            {item.language && (
              <>
                <span className="text-text-muted">Idioma</span>
                <span className="text-text">{item.language}</span>
              </>
            )}
            {item.pages && (
              <>
                <span className="text-text-muted">Paginas</span>
                <span className="text-text">{item.pages}</span>
              </>
            )}
            {item.isbn && (
              <>
                <span className="text-text-muted">ISBN</span>
                <span className="text-text font-mono">{item.isbn}</span>
              </>
            )}
            {item.annotationCount && item.annotationCount > 0 && (
              <>
                <span className="text-text-muted">Anotaciones</span>
                <span className="text-text">{item.annotationCount}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs bg-surface-alt text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions - Read buttons */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
        {Object.entries(item.filePaths)
          .filter(([format]) => format !== 'md')
          .map(([format, path]) => (
          <button
            key={format}
            className="px-4 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors text-sm"
            onClick={() => openReader(format as FileFormat, path)}
          >
            Leer {format.toUpperCase()}
          </button>
        ))}
        {item.notePath && (
          <button
            className="px-4 py-2.5 bg-surface-alt text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors text-sm border border-border"
            onClick={() => setShowNotes(!showNotes)}
          >
            {showNotes ? 'Ocultar notas' : 'Ver notas'}
          </button>
        )}
      </div>

      {/* Notes viewer */}
      {showNotes && item.notePath && (
        <div className="border border-border rounded-xl overflow-hidden">
          <MarkdownViewer filePath={item.notePath} fs={fs} />
        </div>
      )}

      {/* Vault path */}
      <div className="text-xs text-text-muted font-mono p-3 bg-surface-alt rounded-lg">
        {item.vaultPath}
      </div>
    </div>
  );
}
