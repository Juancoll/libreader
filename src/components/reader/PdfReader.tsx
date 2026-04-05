import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { FSAdapter } from '@/services/vaultParser';
import { writeAllReadingData, loadSearchHistory, saveSearchHistoryEntry } from '@/services/annotationWriter';
import type { SearchHistoryEntry } from '@/services/annotationWriter';
import { HIGHLIGHT_COLORS, hexToHighlightFill, isBookmark as isBookmarkAnnotation } from '@/types/annotation';
import type { HighlightColor } from '@/types/annotation';
import {
  toBookmarkEntries, toHighlightEntries, getHighlightsForPages,
} from '@/services/annotationService';
import { VoiceCommentsPanel, MicButtonIcon } from './VoiceCommentsPanel';
import { AnnotationPopup } from './AnnotationPopup';
import { AnnotationsPanel } from './AnnotationsPanel';
import { getTapZoneAction } from './tapZones';
import { getStorageKey, loadFromStorage, saveToStorage } from '@/hooks/useReaderStorage';
import { useReaderUI } from '@/hooks/useReaderUI';
import { useReaderGestures } from '@/hooks/useReaderGestures';
import { useReaderKeyboard } from '@/hooks/useReaderKeyboard';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useLibraryStore } from '@/store/libraryStore';
import type { SelectionInfo, RegionDrag, PendingRegion } from './pdfUtils';
import { PdfPagedView } from './PdfPagedView';
import { PdfScrollPage } from './PdfScrollPage';
import { CloseIcon, ChevronIcon, BookmarkIcon, AnnotationsDocIcon, SearchIcon } from './ReaderIcons';
import { SinglePageIcon, DualPageIcon, PagedModeIcon, ScrollModeIcon, AnnotateModeIcon, FitWidthIcon, FitHeightIcon } from './PdfIcons';
import { SearchPanel } from './SearchPanel';
import type { SearchResult } from './SearchPanel';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ---- Types ----

interface PdfReaderProps {
  filePath: string;
  fs: FSAdapter;
  onClose: () => void;
  onProgress?: (progress: number) => void;
}

type NavMode = 'paged' | 'scroll-v';

interface PdfSettings {
  navMode: NavMode;
  pageLayout: 'single' | 'dual';
  scale: number;
}

// ---- Component ----

export function PdfReader({ filePath, fs, onClose, onProgress }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const navFlashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const categories = useLibraryStore((s) => s.annotationCategories);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [title, setTitle] = useState('');
  const [navFlash, setNavFlash] = useState<'left' | 'right' | null>(null);
  const ui = useReaderUI();

  // Settings (persisted)
  const settingsKey = getStorageKey('pdf', filePath, 'settings');
  const defaultSettings: PdfSettings = { navMode: 'paged', pageLayout: 'single', scale: 1.5 };
  const savedSettings = loadFromStorage<PdfSettings>(settingsKey, defaultSettings);
  const [navMode, setNavMode] = useState<NavMode>(savedSettings.navMode);
  const [pageLayout, setPageLayout] = useState<'single' | 'dual'>(savedSettings.pageLayout);
  const [scale, setScale] = useState(savedSettings.scale);

  const isScrollMode = navMode === 'scroll-v';

  // ---- Fit actions (one-shot scale computation, not a persistent mode) ----
  const applyFit = useCallback(async (axis: 'width' | 'height') => {
    const pdfDoc = pdfDocRef.current;
    const container = isScrollMode
      ? (scrollContainerRef.current ?? containerRef.current)
      : containerRef.current;
    if (!pdfDoc || !container) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const vp = page.getViewport({ scale: 1 });
      const pad = 32;
      const gap = pageLayout === 'dual' ? 8 : 0;
      const availW = container.clientWidth - pad;
      const availH = container.clientHeight - pad;
      const slots = pageLayout === 'dual' ? 2 : 1;
      const slotW = (availW - gap) / slots;
      const fitScale = axis === 'width'
        ? slotW / vp.width
        : availH / vp.height;
      setScale(Math.max(0.5, Math.min(3, +fitScale.toFixed(2))));
    } catch { /* ignore */ }
  }, [currentPage, pageLayout, isScrollMode]);

  // ---- Gesture handling (shared hook) ----
  const gestureCallbacksRef = useRef({
    onSwipeForward: () => {},
    onSwipeBackward: () => {},
    onTapZone: (_clientX: number, _clientY: number) => {},
  });

  const gestures = useReaderGestures(
    {
      onSwipeForward: (...args) => gestureCallbacksRef.current.onSwipeForward(...args),
      onSwipeBackward: (...args) => gestureCallbacksRef.current.onSwipeBackward(...args),
      onTapZone: (...args) => gestureCallbacksRef.current.onTapZone(...args),
    },
    { disabled: isScrollMode },
  );

  // Annotations (unified system — shared hook)
  const ann = useAnnotations(filePath);
  const { annotations, bookmarks, highlights } = ann;
  const [selectionPopup, setSelectionPopup] = useState<SelectionInfo | null>(null);

  // Region annotation mode (for text-less pages like scanned PDFs)
  const [annotateMode, setAnnotateMode] = useState(false);
  const [regionDrag, setRegionDrag] = useState<RegionDrag | null>(null);
  const [pendingRegion, setPendingRegion] = useState<PendingRegion | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [voiceAnnotationId, setVoiceAnnotationId] = useState<string | null>(null);
  const textlessPagesRef = useRef<Set<number>>(new Set());

  // Search history (persisted in vault)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [activeSearchQuery, setActiveSearchQuery] = useState<string>('');
  const searchHighlightColor = useLibraryStore((s) => s.searchHighlightColor);

  // Persist settings
  useEffect(() => {
    saveToStorage(settingsKey, { navMode, pageLayout, scale });
  }, [navMode, pageLayout, scale, settingsKey]);

  // Persist current page
  useEffect(() => {
    if (totalPages > 0) {
      saveToStorage(getStorageKey('pdf', filePath, 'position'), currentPage);
    }
  }, [currentPage, totalPages, filePath]);

  // ---- Highlight actions ----
  const addHighlightFromSelection = useCallback((sel: SelectionInfo, color: HighlightColor, categoryId?: string) => {
    ann.addHighlight({
      position: { index: sel.page, fraction: totalPages > 0 ? sel.page / totalPages : undefined },
      textSelection: {
        text: sel.text,
        startItemIdx: sel.startItemIdx,
        startCharOffset: sel.startCharOffset,
        endItemIdx: sel.endItemIdx,
        endCharOffset: sel.endCharOffset,
      },
      color,
      categoryId,
      chapter: `Pagina ${sel.page}`,
    });
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  }, [ann, totalPages]);

  const removeHighlightAction = useCallback((annotationId: string) => {
    ann.removeHighlight(annotationId);
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
    if (voiceAnnotationId === annotationId) setVoiceAnnotationId(null);
  }, [ann, selectedAnnotationId, voiceAnnotationId]);

  // ---- Bookmark actions ----
  const addBookmarkAction = useCallback(() => {
    if (bookmarks.some((b) => b.position.index === currentPage)) return;
    ann.addBookmark(
      { index: currentPage, fraction: totalPages > 0 ? currentPage / totalPages : undefined },
      `Pagina ${currentPage}`,
    );
  }, [ann, currentPage, totalPages, bookmarks]);

  const removeBookmarkAction = useCallback((annotationId: string) => {
    ann.removeBookmark(annotationId);
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
    if (voiceAnnotationId === annotationId) setVoiceAnnotationId(null);
  }, [ann, selectedAnnotationId, voiceAnnotationId]);

  // Voice-annotation linking — delegated to shared hook

  const toggleBookmark = useCallback(() => {
    const existing = bookmarks.find((b) => b.position.index === currentPage);
    if (existing) {
      removeBookmarkAction(existing.id);
    } else {
      addBookmarkAction();
    }
  }, [currentPage, bookmarks, addBookmarkAction, removeBookmarkAction]);

  const isBookmarked = bookmarks.some((b) => b.position.index === currentPage);

  // ---- Region annotation actions ----
  const addRegionAnnotation = useCallback((region: PendingRegion, color: HighlightColor, categoryId?: string) => {
    ann.addHighlight({
      position: { index: region.page, fraction: totalPages > 0 ? region.page / totalPages : undefined },
      region: { x: region.x, y: region.y, w: region.w, h: region.h },
      color,
      categoryId,
      chapter: `Pagina ${region.page}`,
    });
    setPendingRegion(null);
  }, [ann, totalPages]);

  // Clear region annotation state when navigating pages (paged mode only)
  useEffect(() => {
    if (isScrollMode || isLoading || totalPages === 0) return;
    // Clear any in-progress region drag or pending region on page change
    setPendingRegion(null);
    setRegionDrag(null);
  }, [currentPage, isScrollMode, isLoading, totalPages]);

  // Load search history from vault on mount
  useEffect(() => {
    loadSearchHistory(fs, filePath).then(setSearchHistory).catch(() => {});
  }, [fs, filePath]);

  const handleSearchCompleted = useCallback(async (entry: SearchHistoryEntry) => {
    try {
      const updated = await saveSearchHistoryEntry(fs, filePath, entry);
      setSearchHistory(updated);
    } catch (err) {
      console.warn('Failed to save search history:', err);
    }
  }, [fs, filePath]);

  const handleClearSearchHistory = useCallback(async () => {
    try {
      const dir = filePath + '.reading';
      await fs.writeFile(`${dir}/search-history.json`, '[]');
      setSearchHistory([]);
    } catch (err) {
      console.warn('Failed to clear search history:', err);
    }
  }, [fs, filePath]);

  // Highlights for current page(s)
  const currentHighlights = useMemo(() => {
    const pages = [currentPage];
    if (pageLayout === 'dual' && currentPage + 1 <= totalPages) pages.push(currentPage + 1);
    return getHighlightsForPages(annotations, pages);
  }, [annotations, currentPage, pageLayout, totalPages]);

  // Handle text selection from page components
  const handleTextSelection = useCallback((sel: SelectionInfo) => {
    setSelectionPopup(sel);
  }, []);

  // ---- In-reader search (PDF) ----
  const handlePdfSearch = useCallback(async (query: string): Promise<SearchResult[]> => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return [];
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    setActiveSearchQuery(query);

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');
        const lowerPage = pageText.toLowerCase();
        let searchIdx = 0;
        while (true) {
          const idx = lowerPage.indexOf(lowerQuery, searchIdx);
          if (idx === -1) break;
          // Extract excerpt around the match
          const start = Math.max(0, idx - 40);
          const end = Math.min(pageText.length, idx + query.length + 40);
          const excerpt = (start > 0 ? '...' : '') + pageText.slice(start, end) + (end < pageText.length ? '...' : '');
          results.push({
            id: `p${i}-${idx}`,
            excerpt,
            location: `Pagina ${i}`,
            navData: i,
          });
          searchIdx = idx + query.length;
        }
      } catch {
        // Page might fail to load
      }
    }
    return results;
  }, []);

  const handlePdfSearchNavigate = useCallback((result: SearchResult) => {
    const page = result.navData as number;
    const clamped = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(clamped);
    setSelectionPopup(null);
    onProgress?.(Math.round((clamped / totalPages) * 100));
  }, [totalPages, onProgress]);

  // Save reading state to vault on close
  const saveToVault = useCallback(async () => {
    if (totalPages === 0) return;
    try {
      const progress = currentPage / totalPages;
      await writeAllReadingData(fs, filePath, {
        state: {
          file: filePath.split('/').pop() || filePath,
          format: 'pdf',
          currentPage,
          totalPages,
          progress,
          lastRead: new Date().toISOString(),
          navMode,
          pageLayout,
        },
        bookmarks: toBookmarkEntries(annotations, totalPages),
        highlights: toHighlightEntries(annotations, categories),
      });
    } catch (err) {
      console.warn('Failed to save PDF reading state to vault:', err);
    }
  }, [fs, filePath, currentPage, totalPages, navMode, pageLayout, annotations, categories]);

  const handleClose = useCallback(async () => {
    await saveToVault();
    onClose();
  }, [saveToVault, onClose]);

  // ---- Load PDF ----
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);

        const data = await fs.readBinaryFile(filePath);
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        const metadata = await pdf.getMetadata();
        const info = metadata?.info as any;
        if (info?.Title) {
          setTitle(info.Title);
        } else {
          setTitle(filePath.split('/').pop()?.replace('.pdf', '') || 'PDF');
        }

        const savedPage = loadFromStorage<number>(getStorageKey('pdf', filePath, 'position'), 1);
        if (savedPage > 1 && savedPage <= pdf.numPages) {
          setCurrentPage(savedPage);
        }

        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar el PDF');
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [filePath, fs]);

  // ---- Navigation ----
  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(clamped);
    setSelectionPopup(null);
    onProgress?.(Math.round((clamped / totalPages) * 100));
  }, [totalPages, onProgress]);

  const prevPage = useCallback(() => {
    if (pageLayout === 'dual') goToPage(currentPage - 2);
    else goToPage(currentPage - 1);
  }, [currentPage, goToPage, pageLayout]);

  const nextPage = useCallback(() => {
    if (pageLayout === 'dual') goToPage(currentPage + 2);
    else goToPage(currentPage + 1);
  }, [currentPage, goToPage, pageLayout]);

  const flashNav = useCallback((dir: 'left' | 'right') => {
    setNavFlash(dir);
    clearTimeout(navFlashTimerRef.current);
    navFlashTimerRef.current = setTimeout(() => setNavFlash(null), 300);
  }, []);

  // Reset zoom on page/mode change
  useEffect(() => { gestures.resetZoom(); }, [currentPage, navMode, pageLayout, gestures.resetZoom]);

  // Update gesture callbacks ref
  useEffect(() => {
    gestureCallbacksRef.current.onSwipeForward = () => { nextPage(); flashNav('right'); };
    gestureCallbacksRef.current.onSwipeBackward = () => { prevPage(); flashNav('left'); };
    gestureCallbacksRef.current.onTapZone = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (gestures.zoom <= 1 && container) {
        const action = getTapZoneAction(clientX, clientY, container.getBoundingClientRect());
        if (action === 'toggle-ui') ui.toggleUI();
        else if (action === 'prev') { prevPage(); flashNav('left'); }
        else { nextPage(); flashNav('right'); }
      } else {
        ui.toggleUI();
      }
    };
  });

  // ---- Scroll to position when switching modes ----
  useEffect(() => {
    if (!isScrollMode || totalPages === 0) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const child = container.querySelector(`[data-page-num="${currentPage}"]`) as HTMLElement | null;
        if (child) {
          child.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      });
    });
  }, [navMode]); // Only on mode change

  // ---- Keyboard navigation ----
  useReaderKeyboard({
    next: nextPage,
    prev: prevPage,
    escape: () => ui.cascadeClose(handleClose, {
      selectionPopup: !!selectionPopup,
      clearSelection: () => setSelectionPopup(null),
      annotateMode,
      clearAnnotateMode: () => { setAnnotateMode(false); setRegionDrag(null); setPendingRegion(null); },
      voiceAnnotationId,
      clearVoiceAnnotation: () => setVoiceAnnotationId(null),
    }),
    bookmark: toggleBookmark,
    annotate: () => setAnnotateMode((m) => { if (m) { setPendingRegion(null); setRegionDrag(null); } return !m; }),
    layout: () => setPageLayout((l) => l === 'single' ? 'dual' : 'single'),
    navMode: () => setNavMode((m) => m === 'paged' ? 'scroll-v' : 'paged'),
    zoomIn: () => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2))),
    zoomOut: () => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2))),
    fitWidth: () => applyFit('width'),
  });

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  // Build page list for scroll mode
  const pageNums = useMemo(() => Array.from({ length: totalPages }, (_, i) => i + 1), [totalPages]);

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col">
      {/* Top bar */}
      <header
        className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0 transition-all duration-300 ${
          ui.showUI ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            title="Cerrar (Esc)"
          >
            <CloseIcon size={20} className="text-text" />
          </button>
          <h2 className="text-sm font-semibold text-text truncate max-w-[40vw]">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {/* ── Group 1: Visualizacion ── */}
          {/* Page layout */}
          <button
            onClick={() => setPageLayout((l) => l === 'single' ? 'dual' : 'single')}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover transition-colors"
            title={pageLayout === 'single' ? 'Simple (L)' : 'Doble (L)'}
          >
            {pageLayout === 'single' ? <SinglePageIcon size={18} /> : <DualPageIcon size={18} />}
          </button>

          {/* Nav mode */}
          <button
            onClick={() => setNavMode((m) => m === 'paged' ? 'scroll-v' : 'paged')}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover transition-colors"
            title={navMode === 'paged' ? 'Paginas (N)' : 'Scroll (N)'}
          >
            {navMode === 'paged' ? <PagedModeIcon size={18} /> : <ScrollModeIcon size={18} />}
          </button>

          {/* Zoom controls */}
          <button
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary text-sm"
            title="Reducir zoom (-)"
          >
            -
          </button>
          <span className="text-xs text-text-muted w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary text-sm"
            title="Aumentar zoom (+)"
          >
            +
          </button>

          {/* Fit actions */}
          <button
            onClick={() => applyFit('width')}
            className="p-1.5 rounded-lg transition-colors text-text-secondary hover:bg-surface-hover"
            title="Ajustar al ancho (F)"
          >
            <FitWidthIcon size={16} />
          </button>
          <button
            onClick={() => applyFit('height')}
            className="p-1.5 rounded-lg transition-colors text-text-secondary hover:bg-surface-hover"
            title="Ajustar al alto"
          >
            <FitHeightIcon size={16} />
          </button>

          {/* ── Divider ── */}
          <div className="w-px h-5 bg-border mx-1" />

          {/* ── Group 2: Marcadores / Anotaciones ── */}
          {/* Bookmark */}
          <button
            onClick={toggleBookmark}
            className={`p-2 rounded-lg transition-colors ${isBookmarked ? 'text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
            title="Marcador (B)"
          >
            <BookmarkIcon filled={isBookmarked} size={18} />
          </button>

          {/* Annotations panel */}
          <button
            onClick={() => ui.togglePanel('annotations')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('annotations') ? 'bg-primary/20' : 'hover:bg-surface-hover'}`}
            title="Anotaciones"
          >
            <AnnotationsDocIcon size={18} className="text-text-secondary" />
          </button>

          {/* Annotate mode (region) */}
          <button
            onClick={() => setAnnotateMode((m) => { if (m) { setPendingRegion(null); setRegionDrag(null); } return !m; })}
            className={`p-2 rounded-lg transition-colors ${annotateMode ? 'bg-primary/20 text-primary' : 'hover:bg-surface-hover text-text-secondary'}`}
            title={annotateMode ? 'Salir de modo anotar (A)' : 'Modo anotar region (A)'}
          >
            <AnnotateModeIcon />
          </button>

          {/* Voice comments */}
          <button
            onClick={() => ui.togglePanel('voice')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('voice') ? 'bg-primary/20' : 'hover:bg-surface-hover'}`}
            title="Comentarios de voz"
          >
            <MicButtonIcon size={18} />
          </button>

          {/* ── Divider ── */}
          <div className="w-px h-5 bg-border mx-1" />

          {/* ── Group 3: Busqueda ── */}
          <button
            onClick={() => ui.togglePanel('search')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('search') ? 'bg-primary/20' : 'hover:bg-surface-hover'}`}
            title="Buscar en el PDF"
          >
            <SearchIcon size={18} className="text-text-secondary" />
          </button>
        </div>
      </header>

      {/* Progress bar (absolute, follows header) */}
      <div
        className="absolute left-0 right-0 z-[39] h-0.5 transition-all duration-300"
        style={{ top: ui.showUI ? 48 : 0, background: 'var(--color-border, #e0e0e0)' }}
      >
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Content area — takes full height, bars overlay on top */}
      <div className="flex-1 flex overflow-hidden">
        {/* Annotations sidebar */}
        {ui.isPanelOpen('annotations') && (
          <AnnotationsPanel
            annotations={annotations}
            onNavigate={(a) => {
              if (a.position.index != null) goToPage(a.position.index);
              setSelectedAnnotationId(a.id);
            }}
            onDelete={(id) => {
              const found = annotations.find((a) => a.id === id);
              if (found && !isBookmarkAnnotation(found)) {
                removeHighlightAction(id);
              } else {
                removeBookmarkAction(id);
              }
            }}
            onEditNote={ann.updateNote}
            selectedAnnotationId={selectedAnnotationId}
            onVoiceClick={(annId) => {
              setVoiceAnnotationId(annId);
            }}
            formatBookmarkLocation={(a) => ({
              title: `Pagina ${a.position.index ?? '?'}`,
              detail: totalPages > 0 && a.position.index != null
                ? `${Math.round((a.position.index / totalPages) * 100)}%`
                : undefined,
            })}
            formatHighlightLocation={(a) => `Pagina ${a.position.index ?? '?'}`}
            fs={fs}
            filePath={filePath}
            currentLocation={`page:${currentPage}`}
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
          />
        )}

        {/* Voice comments sidebar */}
        {ui.isPanelOpen('voice') && (
          <aside className="w-80 border-r border-border overflow-y-auto shrink-0 bg-surface">
            <VoiceCommentsPanel
              fs={fs}
              filePath={filePath}
              currentLocation={`page:${currentPage}`}
              variant="panel"
              onVoiceLinked={ann.voiceLinked}
              onVoiceUnlinked={ann.voiceUnlinked}
              onAutoCreateAnnotation={(voiceId) => {
                ann.autoCreateForVoice(
                  voiceId,
                  { index: currentPage, fraction: totalPages > 0 ? currentPage / totalPages : undefined },
                  `Pagina ${currentPage}`,
                );
              }}
            />
          </aside>
        )}

        {/* Voice panel for selected annotation */}
        {voiceAnnotationId && ui.isPanelOpen('annotations') && (
          <aside className="w-72 border-r border-border overflow-y-auto shrink-0 bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-text-secondary">Audio de anotacion</h4>
              <button
                onClick={() => setVoiceAnnotationId(null)}
                className="p-1 hover:bg-surface-hover rounded text-text-muted"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <VoiceCommentsPanel
              fs={fs}
              filePath={filePath}
              currentLocation={`page:${currentPage}`}
              variant="panel"
              annotationId={voiceAnnotationId}
              onVoiceLinked={ann.voiceLinked}
              onVoiceUnlinked={ann.voiceUnlinked}
            />
          </aside>
        )}

        {/* Search panel */}
        {ui.isPanelOpen('search') && (
          <SearchPanel
            onSearch={handlePdfSearch}
            onNavigate={handlePdfSearchNavigate}
            hasAbsoluteHeader
            history={searchHistory}
            onSearchCompleted={handleSearchCompleted}
            onClearHistory={handleClearSearchHistory}
          />
        )}

        {/* PDF content */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center bg-surface-alt"
          style={{
            minHeight: 0,
            touchAction: isScrollMode ? 'auto' : 'none',
            cursor: gestures.zoom > 1 ? 'grab' : 'default',
          }}
          {...(!isScrollMode ? gestures.handlers : {})}
        >
          {isLoading && (
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-text-muted">Cargando PDF...</p>
            </div>
          )}

          {error && (
            <div className="text-center space-y-3 max-w-md">
              <p className="text-danger font-medium">Error al cargar el PDF</p>
              <p className="text-sm text-text-muted">{error}</p>
              <button onClick={handleClose} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
                Volver
              </button>
            </div>
          )}

          {!isLoading && !error && navMode === 'paged' && (
            <div
              className="w-full h-full flex items-center justify-center overflow-hidden"
              style={{
                transform: `scale(${gestures.zoom}) translate(${gestures.pan.x / gestures.zoom}px, ${gestures.pan.y / gestures.zoom}px)`,
                transformOrigin: 'center center',
                transition: gestures.zoom === 1 ? 'transform 0.2s ease' : 'none',
              }}
            >
              <PdfPagedView
                pdfDoc={pdfDocRef.current!}
                currentPage={currentPage}
                pageLayout={pageLayout}
                scale={scale}

                totalPages={totalPages}
                highlights={currentHighlights}
                onTextSelection={handleTextSelection}
                containerRef={containerRef}
                annotateMode={annotateMode}
                regionDrag={regionDrag}
                setRegionDrag={setRegionDrag}
                pendingRegion={pendingRegion}
                setPendingRegion={setPendingRegion}
                annotations={annotations}
                textlessPagesRef={textlessPagesRef}
                selectedAnnotationId={selectedAnnotationId}
                searchQuery={ui.isPanelOpen('search') ? activeSearchQuery : ''}
                searchHighlightColor={searchHighlightColor}
                onAnnotationClick={(annId) => {
                  setSelectedAnnotationId(annId);
                  if (!ui.isPanelOpen('annotations')) ui.togglePanel('annotations');
                }}
              />
            </div>
          )}

          {!isLoading && !error && navMode === 'scroll-v' && (
            <div
              ref={scrollContainerRef}
              className="w-full h-full overflow-y-auto overflow-x-hidden"
              style={{ scrollBehavior: 'smooth' }}
              onClick={isScrollMode ? (e: React.MouseEvent) => {
                const target = e.target as HTMLElement;
                if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;
                const sel = window.getSelection();
                if (sel && sel.toString().length > 0) return;
                ui.toggleUI();
              } : undefined}
            >
              <div className="flex flex-col items-center py-4 gap-2">
                {pageNums.map((pageNum) => (
                  <PdfScrollPage
                    key={pageNum}
                    pdfDoc={pdfDocRef.current!}
                    pageNum={pageNum}
                    pageLayout={pageLayout}
                    scale={scale}
                    totalPages={totalPages}
                    highlights={highlights.filter((h) => h.position.index === pageNum || (pageLayout === 'dual' && h.position.index === pageNum + 1))}
                    onTextSelection={handleTextSelection}
                    containerRef={containerRef}
                    onVisible={(num) => {
                      setCurrentPage(num);
                      onProgress?.(Math.round((num / totalPages) * 100));
                    }}
                    annotations={annotations}
                    textlessPagesRef={textlessPagesRef}
                    selectedAnnotationId={selectedAnnotationId}
                    searchQuery={ui.isPanelOpen('search') ? activeSearchQuery : ''}
                    searchHighlightColor={searchHighlightColor}
                    onAnnotationClick={(annId) => {
                      setSelectedAnnotationId(annId);
                      if (!ui.isPanelOpen('annotations')) ui.togglePanel('annotations');
                    }}
                    annotateMode={annotateMode}
                    regionDrag={regionDrag}
                    setRegionDrag={setRegionDrag}
                    pendingRegion={pendingRegion}
                    setPendingRegion={setPendingRegion}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Selection popup (highlight action) */}
          {selectionPopup && (
            <AnnotationPopup
              x={selectionPopup.x}
              y={selectionPopup.y}
              onHighlight={(color, categoryId) => addHighlightFromSelection(selectionPopup, color, categoryId)}
              onDismiss={() => { setSelectionPopup(null); window.getSelection()?.removeAllRanges(); }}
            />
          )}

          {/* Region annotation popup (after drag-selecting a region) */}
          {pendingRegion && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <div className="bg-surface border border-border rounded-xl shadow-xl p-4 space-y-3 min-w-[200px]">
                <p className="text-sm font-medium text-text">Anotar region en pagina {pendingRegion.page}</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {categories.length > 0 ? (
                    categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => addRegionAnnotation(pendingRegion, 'yellow', cat.id)}
                        className="w-8 h-8 rounded-full border-2 border-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: hexToHighlightFill(cat.color) }}
                        title={cat.name}
                      />
                    ))
                  ) : (
                    (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
                      <button
                        key={color}
                        onClick={() => addRegionAnnotation(pendingRegion, color)}
                        className="w-8 h-8 rounded-full border-2 border-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: HIGHLIGHT_COLORS[color].fill }}
                        title={HIGHLIGHT_COLORS[color].label}
                      />
                    ))
                  )}
                </div>
                <button
                  onClick={() => setPendingRegion(null)}
                  className="w-full text-xs text-text-muted hover:text-text py-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Annotate mode indicator */}
          {annotateMode && !pendingRegion && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="bg-primary/80 text-white text-xs px-3 py-1.5 rounded-full shadow">
                Modo anotar: dibuja un rectangulo
              </div>
            </div>
          )}

          {/* Nav flash feedback (paged mode only) */}
          {!isScrollMode && !isLoading && !error && gestures.zoom <= 1 && (
            <>
              {navFlash === 'left' && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none animate-pulse">
                  <span className="w-12 h-12 rounded-full flex items-center justify-center shadow-md bg-surface/80">
                    <ChevronIcon size={24} className="text-text" direction="left" />
                  </span>
                </div>
              )}
              {navFlash === 'right' && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none animate-pulse">
                  <span className="w-12 h-12 rounded-full flex items-center justify-center shadow-md bg-surface/80">
                    <ChevronIcon size={24} className="text-text" direction="right" />
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <footer
        className={`absolute bottom-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 border-t border-border bg-surface transition-all duration-300 ${
          ui.showUI ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={prevPage}
          disabled={currentPage <= 1}
          className="px-3 py-1.5 text-sm rounded-lg hover:bg-surface-hover disabled:opacity-30 text-text-secondary"
        >
          Anterior
        </button>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="flex-1 h-1 accent-primary cursor-pointer"
            style={{ minWidth: '120px' }}
          />
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="w-16 px-2 py-1 text-sm text-center rounded border border-border bg-surface text-text focus:outline-none focus:border-primary"
          />
          <span className="text-sm text-text-muted">/ {totalPages}</span>
        </div>

        <button
          onClick={nextPage}
          disabled={currentPage >= totalPages}
          className="px-3 py-1.5 text-sm rounded-lg hover:bg-surface-hover disabled:opacity-30 text-text-secondary"
        >
          Siguiente
        </button>
      </footer>
    </div>
  );
}
