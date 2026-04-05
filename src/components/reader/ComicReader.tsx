import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { FSAdapter } from '@/services/vaultParser';
import {
  extractCbz,
  extractCbr,
  cleanupPages,
  loadAllDimensions,
  buildSpreads,
  type ComicPage,
} from '@/services/comicParser';
import { writeAllReadingData } from '@/services/annotationWriter';
import { HIGHLIGHT_COLORS, hexToHighlightFill, resolveAnnotationFill } from '@/types/annotation';
import type { HighlightColor } from '@/types/annotation';
import {
  toBookmarkEntries, toHighlightEntries,
} from '@/services/annotationService';
import { useReaderGestures } from '@/hooks/useReaderGestures';
import { useReaderUI } from '@/hooks/useReaderUI';
import { useReaderKeyboard } from '@/hooks/useReaderKeyboard';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useLibraryStore } from '@/store/libraryStore';
import { getStorageKey, loadFromStorage, saveToStorage } from '@/hooks/useReaderStorage';
import { VoiceCommentsPanel, MicButtonIcon } from './VoiceCommentsPanel';
import { AnnotationsPanel } from './AnnotationsPanel';
import { getTapZoneAction } from './tapZones';
import { getImageContentRect, findImgElement } from './comicUtils';
import { ScrollUnitV, ScrollUnitH } from './ComicScrollUnits';
import { CloseIcon, ChevronIcon, BookmarkIcon, AnnotationsDocIcon } from './ReaderIcons';
import { SettingsIcon, AnnotateModeIcon } from './ComicIcons';

// ---- Types ----

interface ComicReaderProps {
  filePath: string;
  format: 'cbz' | 'cbr';
  fs: FSAdapter;
  onClose: () => void;
  onProgress?: (progress: number) => void;
}

type PageLayout = 'single' | 'dual';
type NavMode = 'paged' | 'scroll-v' | 'scroll-h';
type ReadingDirection = 'ltr' | 'rtl';

interface ComicSettings {
  pageLayout: PageLayout;
  navMode: NavMode;
  direction: ReadingDirection;
}

// ---- Storage migration helper ----

function loadComicSettings(key: string, fallback: ComicSettings): ComicSettings {
  const raw = loadFromStorage<any>(key, null);
  if (!raw) return fallback;
  // Migrate old viewMode settings to new schema
  if ('viewMode' in raw && !('pageLayout' in raw)) {
    const vm = raw.viewMode as string;
    return {
      pageLayout: vm === 'spread' ? 'dual' : 'single',
      navMode: vm === 'scroll' ? 'scroll-v' : 'paged',
      direction: raw.direction || fallback.direction,
    };
  }
  // Strip out deprecated fitMode if present
  if ('fitMode' in raw) {
    const { fitMode: _, ...rest } = raw;
    return { ...fallback, ...rest };
  }
  return raw;
}

// ---- Constants ----

const PRELOAD_AHEAD = 4;
const PRELOAD_BEHIND = 2;
const STORAGE_PREFIX = 'comic';

// ---- Component ----

export function ComicReader({ filePath, format, fs, onClose, onProgress }: ComicReaderProps) {
  // Pages & loading
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Extrayendo paginas...');
  const [error, setError] = useState<string | null>(null);
  const categories = useLibraryStore((s) => s.annotationCategories);

  // Navigation
  const [currentPage, setCurrentPage] = useState(0);

  // Settings
  const settingsKey = getStorageKey(STORAGE_PREFIX, filePath, 'settings');
  const defaultSettings: ComicSettings = {
    pageLayout: 'single',
    navMode: 'paged',
    direction: 'ltr',
  };
  const savedSettings = loadComicSettings(settingsKey, defaultSettings);
  const [pageLayout, setPageLayout] = useState<PageLayout>(savedSettings.pageLayout);
  const [navMode, setNavMode] = useState<NavMode>(savedSettings.navMode);
  const [direction, setDirection] = useState<ReadingDirection>(savedSettings.direction);

  // UI state (shared hook — replaces 5 independent booleans)
  const ui = useReaderUI();

  // Annotations (unified system — shared hook)
  const ann = useAnnotations(filePath);
  const { annotations, bookmarks } = ann;
  const [annotateMode, setAnnotateMode] = useState(false);
  const [regionDrag, setRegionDrag] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const [pendingRegion, setPendingRegion] = useState<{ x: number; y: number; w: number; h: number; pageIdx: number } | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  /** When set, the VoiceCommentsPanel is shown linked to this annotation */
  const [voiceAnnotationId, setVoiceAnnotationId] = useState<string | null>(null);

  // Content area offset: tracks the image content position within imageContainerRef
  // This accounts for any object-fit: contain letterboxing (bars around the image).
  // Format: { left, top, width, height } as percentages of the container.
  const [contentAreaPct, setContentAreaPct] = useState({ left: 0, top: 0, width: 100, height: 100 });

  // Update content area when image loads or container resizes
  const updateContentArea = useCallback(() => {
    const container = imageContainerRef.current;
    if (!container) return;
    const img = findImgElement(container);
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    const containerRect = container.getBoundingClientRect();
    const contentRect = getImageContentRect(img);

    if (containerRect.width === 0 || containerRect.height === 0) return;

    const left = ((contentRect.left - containerRect.left) / containerRect.width) * 100;
    const top = ((contentRect.top - containerRect.top) / containerRect.height) * 100;
    const width = (contentRect.width / containerRect.width) * 100;
    const height = (contentRect.height / containerRect.height) * 100;

    setContentAreaPct((prev) => {
      if (prev.left === left && prev.top === top && prev.width === width && prev.height === height) return prev;
      return { left, top, width, height };
    });
  }, []);

  // Observe container resizes to keep content area in sync
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => updateContentArea());
    observer.observe(container);

    // Also update when images load
    const img = findImgElement(container);
    if (img) {
      img.addEventListener('load', updateContentArea);
    }

    return () => {
      observer.disconnect();
      if (img) img.removeEventListener('load', updateContentArea);
    };
  }, [updateContentArea, currentPage, pageLayout, navMode]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const preloadedRef = useRef<Set<number>>(new Set());
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Derived: is scrolling mode?
  const isScrollMode = navMode === 'scroll-v' || navMode === 'scroll-h';

  // ---- Gesture handling (shared hook) ----
  // We use a ref for gesture callbacks so the hook can be instantiated before
  // navigation functions are defined (avoids circular dependency).
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
    { disabled: isScrollMode, doubleTapZoom: true },
  );

  const { zoom, pan, setZoom, resetZoom, adjustZoom } = gestures;

  // Persist settings
  useEffect(() => {
    saveToStorage(settingsKey, { pageLayout, navMode, direction });
  }, [pageLayout, navMode, direction, settingsKey]);

  // Auto-disable annotate mode when switching away from single-paged
  // Auto-disable annotate mode when in dual layout (can't draw across two pages)
  useEffect(() => {
    if (pageLayout !== 'single') {
      setAnnotateMode(false);
      setPendingRegion(null);
      setRegionDrag(null);
    }
  }, [pageLayout]);

  // Persist current page position
  useEffect(() => {
    if (pages.length > 0) {
      saveToStorage(getStorageKey(STORAGE_PREFIX, filePath, 'position'), currentPage);
    }
  }, [currentPage, pages.length, filePath]);

  // Spreads for dual layout
  const spreads = useMemo(() => {
    if (pageLayout !== 'dual') return [];
    return buildSpreads(pages, direction === 'rtl');
  }, [pages, pageLayout, direction]);

  // Current spread index (which spread contains currentPage)
  const currentSpreadIndex = useMemo(() => {
    if (pageLayout !== 'dual') return 0;
    const idx = spreads.findIndex((s) => s.includes(currentPage));
    return idx >= 0 ? idx : 0;
  }, [spreads, currentPage, pageLayout]);

  // ---- Load comic ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        setLoadingStatus('Extrayendo paginas...');

        const data = await fs.readBinaryFile(filePath);
        if (cancelled) return;

        let extracted: ComicPage[];
        if (format === 'cbz') {
          extracted = extractCbz(data);
        } else {
          extracted = await extractCbr(data);
        }

        if (cancelled) {
          cleanupPages(extracted);
          return;
        }

        setLoadingStatus(`Analizando ${extracted.length} paginas...`);

        await loadAllDimensions(extracted);
        if (cancelled) {
          cleanupPages(extracted);
          return;
        }

        setPages(extracted);

        const savedPage = loadFromStorage<number>(getStorageKey(STORAGE_PREFIX, filePath, 'position'), 0);
        if (savedPage > 0 && savedPage < extracted.length) {
          setCurrentPage(savedPage);
        }

        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar el comic');
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [filePath, format, fs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPages(pages);
    };
  }, [pages]);

  // ---- Navigation ----
  const totalPages = pages.length;

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage(clamped);
      onProgress?.(Math.round(((clamped + 1) / totalPages) * 100));
      resetZoom();
    },
    [totalPages, onProgress, resetZoom]
  );

  const goForward = useCallback(() => {
    if (pageLayout === 'dual' && spreads.length > 0) {
      const nextSpread = currentSpreadIndex + 1;
      if (nextSpread < spreads.length) {
        goToPage(spreads[nextSpread][0]);
      }
    } else {
      goToPage(currentPage + 1);
    }
  }, [pageLayout, spreads, currentSpreadIndex, currentPage, goToPage]);

  const goBackward = useCallback(() => {
    if (pageLayout === 'dual' && spreads.length > 0) {
      const prevSpread = currentSpreadIndex - 1;
      if (prevSpread >= 0) {
        goToPage(spreads[prevSpread][0]);
      }
    } else {
      goToPage(currentPage - 1);
    }
  }, [pageLayout, spreads, currentSpreadIndex, currentPage, goToPage]);

  const nextPage = useCallback(() => {
    if (direction === 'rtl') goBackward();
    else goForward();
  }, [direction, goForward, goBackward]);

  const prevPage = useCallback(() => {
    if (direction === 'rtl') goForward();
    else goBackward();
  }, [direction, goForward, goBackward]);

  // ---- Save to vault on close ----
  const saveToVault = useCallback(async () => {
    if (totalPages === 0) return;
    try {
      await writeAllReadingData(fs, filePath, {
        state: {
          file: filePath.split('/').pop() || filePath,
          format,
          currentPage,
          totalPages,
          progress: totalPages > 0 ? (currentPage + 1) / totalPages : 0,
          lastRead: new Date().toISOString(),
          pageLayout,
          navMode,
          readingDirection: direction,
          zoom: { level: zoom, mode: 'contain' },
        },
        bookmarks: toBookmarkEntries(annotations, totalPages),
        highlights: toHighlightEntries(annotations, categories),
      });
    } catch (err) {
      console.warn('Failed to save reading data to vault:', err);
    }
  }, [fs, filePath, format, currentPage, totalPages, pageLayout, navMode, direction, zoom, annotations, categories]);

  const handleClose = useCallback(async () => {
    await saveToVault();
    onClose();
  }, [saveToVault, onClose]);

  // ---- Annotation actions ----

  const addBookmarkAction = useCallback(() => {
    // Don't add duplicate bookmark for same page
    const existing = bookmarks.find((b) => b.position.index === currentPage + 1);
    if (existing) return;
    ann.addBookmark(
      { index: currentPage + 1, fraction: totalPages > 0 ? (currentPage + 1) / totalPages : 0 },
      `Pagina ${currentPage + 1}`,
    );
  }, [ann, currentPage, totalPages, bookmarks]);

  const removeBookmarkAction = useCallback((annotationId: string) => {
    ann.removeBookmark(annotationId);
  }, [ann]);

  const toggleBookmark = useCallback(() => {
    const existing = bookmarks.find((b) => b.position.index === currentPage + 1);
    if (existing) {
      removeBookmarkAction(existing.id);
    } else {
      addBookmarkAction();
    }
  }, [currentPage, bookmarks, addBookmarkAction, removeBookmarkAction]);

  const isBookmarked = bookmarks.some((b) => b.position.index === currentPage + 1);

  const addRegionAnnotation = useCallback((color: HighlightColor, categoryId?: string) => {
    if (!pendingRegion) return;
    ann.addHighlight({
      position: { index: pendingRegion.pageIdx, fraction: totalPages > 0 ? pendingRegion.pageIdx / totalPages : 0 },
      region: { x: pendingRegion.x, y: pendingRegion.y, w: pendingRegion.w, h: pendingRegion.h },
      color,
      categoryId,
      chapter: `Pagina ${pendingRegion.pageIdx}`,
    });
    setPendingRegion(null);
    setAnnotateMode(false);
  }, [ann, pendingRegion, totalPages]);

  const removeAnnotationAction = useCallback((annotationId: string) => {
    ann.removeAnnotationById(annotationId);
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
    if (voiceAnnotationId === annotationId) setVoiceAnnotationId(null);
  }, [ann, selectedAnnotationId, voiceAnnotationId]);

  // Voice-annotation linking — delegated to shared hook

  // Get region annotations for a specific page (1-indexed)
  const getPageRegions = useCallback((pageIdx: number) => {
    return annotations.filter((a) => a.region && a.position.index === pageIdx);
  }, [annotations]);

  // ---- Preloading ----
  useEffect(() => {
    if (pages.length === 0 || isScrollMode) return;

    const toPreload: number[] = [];
    for (let i = currentPage - PRELOAD_BEHIND; i <= currentPage + PRELOAD_AHEAD; i++) {
      if (i >= 0 && i < pages.length && !preloadedRef.current.has(i)) {
        toPreload.push(i);
      }
    }

    for (const idx of toPreload) {
      const img = new Image();
      img.src = pages[idx].url;
      preloadedRef.current.add(idx);
    }
  }, [currentPage, pages, isScrollMode]);

  // ---- Zoom helpers are provided by gestures hook ----

  // ---- Keyboard navigation (shared hook) ----
  useReaderKeyboard({
    next: () => { if (direction === 'rtl') goBackward(); else goForward(); },
    prev: () => { if (direction === 'rtl') goForward(); else goBackward(); },
    up: goBackward,
    down: goForward,
    escape: () => {
      ui.cascadeClose(handleClose, {
        annotateMode,
        clearAnnotateMode: () => { setAnnotateMode(false); setPendingRegion(null); setRegionDrag(null); },
        voiceAnnotationId,
        clearVoiceAnnotation: () => setVoiceAnnotationId(null),
      });
    },
    bookmark: toggleBookmark,
    annotate: () => {
      if (pageLayout === 'single') {
        setAnnotateMode((m) => { if (m) { setPendingRegion(null); setRegionDrag(null); } return !m; });
      }
    },
    layout: () => { setPageLayout((l) => (l === 'single' ? 'dual' : 'single')); resetZoom(); },
    navMode: () => { setNavMode((m) => (m === 'paged' ? 'scroll-v' : m === 'scroll-v' ? 'scroll-h' : 'paged')); resetZoom(); },
    direction: () => setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr')),
    zoomIn: () => adjustZoom(0.5),
    zoomOut: () => adjustZoom(-0.5),
    zoomReset: resetZoom,
    home: () => goToPage(0),
    end: () => goToPage(totalPages - 1),
  });

  // ---- Wire gesture callbacks (after navigation functions are defined) ----
  gestureCallbacksRef.current = {
    onSwipeForward: nextPage,
    onSwipeBackward: prevPage,
    onTapZone: (clientX: number, clientY: number) => {
      if (annotateMode) return;
      const container = containerRef.current;
      if (!container) return;
      if (zoom > 1) { ui.toggleUI(); return; }
      const action = getTapZoneAction(clientX, clientY, container.getBoundingClientRect());
      if (action === 'toggle-ui') ui.toggleUI();
      else if (action === 'prev') prevPage();
      else nextPage();
    },
  };

  // Scroll mode: toggle UI on tap
  const handleScrollTap = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') return;
    if (annotateMode) return;
    ui.toggleUI();
  }, [annotateMode, ui]);

  // ---- Region annotation drag handlers (annotate mode, paged only) ----

  /** Get the actual image content rect within the container, accounting for object-fit: contain */
  const getContentRect = useCallback(() => {
    const container = imageContainerRef.current;
    if (!container) return null;
    const img = findImgElement(container);
    if (!img) return null;
    return getImageContentRect(img);
  }, []);

  const handleRegionPointerDown = useCallback((e: React.PointerEvent) => {
    if (!annotateMode || pendingRegion) return;
    const contentRect = getContentRect();
    if (!contentRect) return;

    const x = (e.clientX - contentRect.left) / contentRect.width;
    const y = (e.clientY - contentRect.top) / contentRect.height;

    setRegionDrag({ startX: x, startY: y, curX: x, curY: y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }, [annotateMode, pendingRegion, getContentRect]);

  const handleRegionPointerMove = useCallback((e: React.PointerEvent) => {
    if (!regionDrag) return;
    const contentRect = getContentRect();
    if (!contentRect) return;

    const x = Math.max(0, Math.min(1, (e.clientX - contentRect.left) / contentRect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - contentRect.top) / contentRect.height));

    setRegionDrag((prev) => prev ? { ...prev, curX: x, curY: y } : null);
    e.preventDefault();
    e.stopPropagation();
  }, [regionDrag, getContentRect]);

  const handleRegionPointerUp = useCallback((e: React.PointerEvent) => {
    if (!regionDrag) return;
    e.preventDefault();
    e.stopPropagation();

    const rx = Math.min(regionDrag.startX, regionDrag.curX);
    const ry = Math.min(regionDrag.startY, regionDrag.curY);
    const rw = Math.abs(regionDrag.curX - regionDrag.startX);
    const rh = Math.abs(regionDrag.curY - regionDrag.startY);

    setRegionDrag(null);

    // Minimum size threshold (ignore tiny accidental clicks)
    if (rw < 0.02 || rh < 0.02) return;

    setPendingRegion({ x: rx, y: ry, w: rw, h: rh, pageIdx: currentPage + 1 });
  }, [regionDrag, currentPage]);

  // ---- Build display units (pages or spreads) ----
  // A "unit" is what we display: either a single page index or a pair [left, right]
  const displayUnits = useMemo((): number[][] => {
    if (pageLayout === 'dual') {
      return spreads.length > 0 ? spreads : pages.map((_, i) => [i]);
    }
    return pages.map((_, i) => [i]);
  }, [pageLayout, spreads, pages]);

  // Current display unit index for paged mode
  const currentUnitIndex = useMemo(() => {
    if (pageLayout === 'dual') return currentSpreadIndex;
    return currentPage;
  }, [pageLayout, currentSpreadIndex, currentPage]);

  // ---- Scroll to current position when switching to a scroll mode ----
  useEffect(() => {
    if (!isScrollMode || pages.length === 0) return;

    // Find which unit index contains currentPage
    const targetUnitIdx = displayUnits.findIndex((unit) => unit.includes(currentPage));
    if (targetUnitIdx <= 0) return; // Already at start, no need to scroll

    // Double rAF: first to let React commit the DOM, second to let the browser layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const child = container.querySelector(`[data-unit-index="${targetUnitIdx}"]`) as HTMLElement | null;
        if (child) {
          child.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'start' });
        } else {
          // Fallback: estimate position
          if (navMode === 'scroll-v') {
            const estimatedTop = targetUnitIdx * container.clientHeight;
            container.scrollTo({ top: estimatedTop, behavior: 'instant' });
          } else {
            const estimatedLeft = targetUnitIdx * container.clientWidth;
            container.scrollTo({ left: estimatedLeft, behavior: 'instant' });
          }
        }
      });
    });
  }, [navMode, pageLayout]); // Only when mode/layout changes, not on every page change

  // ---- Derived values ----
  const progress = totalPages > 0 ? Math.round(((currentPage + 1) / totalPages) * 100) : 0;
  const title = filePath.split('/').pop()?.replace(/\.(cbz|cbr)$/i, '') || 'Comic';

  const layoutLabel = pageLayout === 'single' ? 'Simple' : 'Doble';
  const navLabel = navMode === 'paged' ? 'Paginas' : navMode === 'scroll-v' ? 'Scroll V' : 'Scroll H';
  const dirLabel = direction === 'ltr' ? 'LTR' : 'RTL';

  // ---- Render region overlays for a given page ----
  // Overlays are absolutely positioned within a container that should match the image content area.
  // When the container shrink-wraps the image (inline-flex + auto-sizing), percentages map directly.
  // The getImageContentRect utility provides precision if object-fit: contain introduces letterboxing.
  const renderRegionOverlays = (pageIdx: number) => {
    const regions = getPageRegions(pageIdx + 1); // pageIdx is 0-indexed, annotations use 1-indexed
    if (regions.length === 0) return null;
    return (
      <>
        {regions.map((ann) => {
          const isSelected = selectedAnnotationId === ann.id;
          return (
            <div
              key={ann.id}
              className="absolute cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAnnotationId(ann.id);
                ui.togglePanel('annotations');
              }}
              style={{
                left: `${(ann.region!.x) * 100}%`,
                top: `${(ann.region!.y) * 100}%`,
                width: `${(ann.region!.w) * 100}%`,
                height: `${(ann.region!.h) * 100}%`,
                background: resolveAnnotationFill(ann.style, categories),
                border: isSelected
                  ? '2px solid rgba(255,255,255,0.9)'
                  : `2px solid ${resolveAnnotationFill(ann.style, categories).replace(/[\d.]+\)$/, '0.8)')}`,
                borderRadius: 2,
                boxShadow: isSelected ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
              }}
            />
          );
        })}
      </>
    );
  };

  // ---- Render a display unit (single page or spread pair) ----
  const containStyle: React.CSSProperties = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' };

  const renderUnit = (unit: number[], withOverlays = false) => {
    if (unit.length === 1) {
      const p = pages[unit[0]];
      if (!p) return null;
      if (withOverlays) {
        // Overlays are rendered at the renderPaged level, just return img
        return (
          <img
            src={p.url}
            alt={`Pagina ${unit[0] + 1}`}
            style={containStyle}
            draggable={false}
            className="select-none"
          />
        );
      }
      return (
        <div className="relative inline-flex items-center justify-center" style={{ maxWidth: '100%', maxHeight: '100%' }}>
          <img
            src={p.url}
            alt={`Pagina ${unit[0] + 1}`}
            style={containStyle}
            draggable={false}
            className="select-none"
          />
          {renderRegionOverlays(unit[0])}
        </div>
      );
    }
    // Dual: two pages side by side
    return (
      <div className="flex items-center justify-center gap-1 h-full">
        {unit.map((pageIdx) => (
          <div key={pageIdx} className="relative inline-flex items-center justify-center" style={{ maxHeight: '100%', maxWidth: '50%' }}>
            <img
              src={pages[pageIdx]?.url}
              alt={`Pagina ${pageIdx + 1}`}
              style={{
                maxHeight: '100%',
                maxWidth: '100%',
                objectFit: 'contain',
              }}
              draggable={false}
              className="select-none"
            />
            {renderRegionOverlays(pageIdx)}
          </div>
        ))}
      </div>
    );
  };

  // ---- Render: paged mode ----
  const canAnnotate = annotateMode && pageLayout === 'single';

  const renderPaged = () => {
    const unit = displayUnits[currentUnitIndex];
    if (!unit) return null;

    // For single page: flat structure with ref on the wrapper so overlays + drag align to image
    // For dual: nested structure, no annotate drag (annotate mode blocked for dual)
    const isSingle = unit.length === 1;

    // Compute drag rectangle in percent for the overlay
    const dragRect = regionDrag ? {
      left: `${Math.min(regionDrag.startX, regionDrag.curX) * 100}%`,
      top: `${Math.min(regionDrag.startY, regionDrag.curY) * 100}%`,
      width: `${Math.abs(regionDrag.curX - regionDrag.startX) * 100}%`,
      height: `${Math.abs(regionDrag.curY - regionDrag.startY) * 100}%`,
    } : null;

    return (
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: 'center center',
          transition: zoom === 1 ? 'transform 0.2s ease' : 'none',
        }}
      >
        {isSingle ? (
          <div ref={imageContainerRef} className="relative inline-flex items-center justify-center" style={{ maxWidth: '100%', maxHeight: '100%' }}>
            {renderUnit(unit, true)}
            {/* Region overlays + drag overlay positioned at the image content area */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${contentAreaPct.left}%`,
                top: `${contentAreaPct.top}%`,
                width: `${contentAreaPct.width}%`,
                height: `${contentAreaPct.height}%`,
              }}
            >
              {renderRegionOverlays(unit[0])}
            </div>
            {/* Annotate mode: drag overlay aligned to image content area */}
            {canAnnotate && (
              <div
                className="absolute z-10"
                style={{
                  left: `${contentAreaPct.left}%`,
                  top: `${contentAreaPct.top}%`,
                  width: `${contentAreaPct.width}%`,
                  height: `${contentAreaPct.height}%`,
                  cursor: pendingRegion ? 'default' : 'crosshair',
                }}
                onPointerDown={handleRegionPointerDown}
                onPointerMove={handleRegionPointerMove}
                onPointerUp={handleRegionPointerUp}
              >
                {/* Drawing rectangle */}
                {dragRect && (
                  <div
                    className="absolute border-2 border-dashed border-white/80 bg-white/15 rounded-sm pointer-events-none"
                    style={dragRect}
                  />
                )}
                {/* Pending region before color pick */}
                {pendingRegion && (
                  <div
                    className="absolute border-2 border-white bg-white/20 rounded-sm pointer-events-none animate-pulse"
                    style={{
                      left: `${pendingRegion.x * 100}%`,
                      top: `${pendingRegion.y * 100}%`,
                      width: `${pendingRegion.w * 100}%`,
                      height: `${pendingRegion.h * 100}%`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          renderUnit(unit)
        )}
      </div>
    );
  };

  // ---- Render: vertical scroll ----
  const renderScrollV = () => {
    return (
      <div
        ref={scrollContainerRef}
        className="w-full h-full overflow-y-auto overflow-x-hidden"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex flex-col items-center py-2 gap-0.5">
          {displayUnits.map((unit, idx) => (
            <ScrollUnitV
              key={idx}
              unit={unit}
              pages={pages}
              index={idx}
              pageLayout={pageLayout}
              annotations={annotations}
              onVisible={(unitIdx) => {
                const pageIdx = displayUnits[unitIdx]?.[0] ?? 0;
                setCurrentPage(pageIdx);
                onProgress?.(Math.round(((pageIdx + 1) / totalPages) * 100));
              }}
              annotateMode={annotateMode}
              pendingPageIdx={pendingRegion?.pageIdx ?? null}
              onRegionComplete={(region) => setPendingRegion(region)}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationClick={(annId) => {
                setSelectedAnnotationId(annId);
                if (!ui.isPanelOpen('annotations')) ui.togglePanel('annotations');
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // ---- Render: horizontal scroll ----
  const renderScrollH = () => {
    return (
      <div
        ref={scrollContainerRef}
        className="w-full h-full overflow-x-auto overflow-y-hidden"
        style={{
          scrollBehavior: 'smooth',
          scrollSnapType: 'x mandatory',
          direction: direction === 'rtl' ? 'rtl' : 'ltr',
        }}
      >
        <div
          className="flex items-center h-full"
          style={{ direction: direction === 'rtl' ? 'rtl' : 'ltr' }}
        >
          {displayUnits.map((unit, idx) => (
            <ScrollUnitH
              key={idx}
              unit={unit}
              pages={pages}
              index={idx}
              pageLayout={pageLayout}
              annotations={annotations}
              onVisible={(unitIdx) => {
                const pageIdx = displayUnits[unitIdx]?.[0] ?? 0;
                setCurrentPage(pageIdx);
                onProgress?.(Math.round(((pageIdx + 1) / totalPages) * 100));
              }}
              annotateMode={annotateMode}
              pendingPageIdx={pendingRegion?.pageIdx ?? null}
              onRegionComplete={(region) => setPendingRegion(region)}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationClick={(annId) => {
                setSelectedAnnotationId(annId);
                if (!ui.isPanelOpen('annotations')) ui.togglePanel('annotations');
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // ---- Main render ----
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none">
      {/* ---- TOP BAR ---- */}
      <header
        className={`flex items-center justify-between px-3 py-2 bg-black/85 backdrop-blur-sm shrink-0 transition-all duration-300 ${
          ui.showUI ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Cerrar (Esc)"
          >
            <CloseIcon color="white" />
          </button>
          <h2 className="text-sm font-semibold text-white truncate max-w-[40vw]">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {/* Annotations panel */}
          <button
            onClick={() => {
              if (ui.isPanelOpen('annotations')) { setSelectedAnnotationId(null); setVoiceAnnotationId(null); }
              ui.togglePanel('annotations');
            }}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('annotations') ? 'bg-white/20' : 'hover:bg-white/10'}`}
            title="Anotaciones"
          >
            <AnnotationsDocIcon size={18} color="white" />
          </button>

          {/* Bookmark toggle */}
          <button
            onClick={toggleBookmark}
            className={`p-2 rounded-lg transition-colors ${isBookmarked ? 'bg-white/20 text-yellow-400' : 'hover:bg-white/10 text-white/70'}`}
            title={isBookmarked ? 'Quitar marcador (B)' : 'Agregar marcador (B)'}
          >
            <BookmarkIcon filled={isBookmarked} size={18} />
          </button>

          {/* Annotate mode toggle (single layout only) */}
          {pageLayout === 'single' && (
            <button
              onClick={() => { setAnnotateMode((m) => { if (m) { setPendingRegion(null); setRegionDrag(null); } return !m; }); }}
              className={`p-2 rounded-lg transition-colors ${annotateMode ? 'bg-primary/70 text-white' : 'hover:bg-white/10 text-white/70'}`}
              title={annotateMode ? 'Salir de modo anotar (A)' : 'Modo anotar region (A)'}
            >
              <AnnotateModeIcon />
            </button>
          )}

          {/* Page layout */}
          <button
            onClick={() => { setPageLayout((l) => (l === 'single' ? 'dual' : 'single')); resetZoom(); }}
            className="px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:bg-white/10 transition-colors"
            title="Layout (L)"
          >
            {layoutLabel}
          </button>

          {/* Nav mode */}
          <button
            onClick={() => {
              setNavMode((m) => (m === 'paged' ? 'scroll-v' : m === 'scroll-v' ? 'scroll-h' : 'paged'));
              resetZoom();
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:bg-white/10 transition-colors"
            title="Navegacion (N)"
          >
            {navLabel}
          </button>

          {/* Direction */}
          <button
            onClick={() => setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
            className="px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:bg-white/10 transition-colors"
            title="Direccion de lectura (D)"
          >
            {dirLabel}
          </button>

          {/* Settings */}
          <button
            onClick={() => { ui.togglePanel('settings'); setSelectedAnnotationId(null); setVoiceAnnotationId(null); }}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('settings') ? 'bg-white/20' : 'hover:bg-white/10'}`}
            title="Ajustes"
          >
            <SettingsIcon />
          </button>

          {/* Voice comments */}
          <button
            onClick={() => { ui.togglePanel('voice'); setSelectedAnnotationId(null); setVoiceAnnotationId(null); }}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('voice') ? 'bg-white/20' : 'hover:bg-white/10'}`}
            title="Comentarios de voz"
          >
            <MicButtonIcon size={18} />
          </button>
        </div>
      </header>

      {/* ---- SETTINGS PANEL ---- */}
      {ui.isPanelOpen('settings') && ui.showUI && (
        <div
          className="absolute top-12 right-3 z-[60] w-72 bg-zinc-900/95 backdrop-blur rounded-xl border border-white/10 shadow-2xl p-4 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-white">Ajustes del lector</h3>

          {/* Page layout */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Paginas</label>
            <div className="flex gap-1.5">
              {([['single', 'Simple'], ['dual', 'Doble']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => { setPageLayout(mode); resetZoom(); }}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    pageLayout === mode ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Nav mode */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Navegacion</label>
            <div className="flex gap-1.5">
              {([['paged', 'Paginas'], ['scroll-v', 'Scroll V'], ['scroll-h', 'Scroll H']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => { setNavMode(mode); resetZoom(); }}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    navMode === mode ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Reading direction */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Direccion de lectura</label>
            <div className="flex gap-1.5">
              {([['ltr', 'Izq. a Der. (LTR)'], ['rtl', 'Der. a Izq. (RTL)']] as const).map(([dir, label]) => (
                <button
                  key={dir}
                  onClick={() => setDirection(dir)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    direction === dir ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs text-white/50">Zoom</label>
              <span className="text-xs text-white/40 font-mono">{Math.round(zoom * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => adjustZoom(-0.5)} className="p-1 rounded bg-white/5 text-white/60 hover:bg-white/10 text-xs">
                -
              </button>
              <input
                type="range"
                min={100}
                max={500}
                step={10}
                value={Math.round(zoom * 100)}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
                className="flex-1 h-1 accent-primary cursor-pointer"
              />
              <button onClick={() => adjustZoom(0.5)} className="p-1 rounded bg-white/5 text-white/60 hover:bg-white/10 text-xs">
                +
              </button>
              <button onClick={resetZoom} className="px-2 py-1 rounded bg-white/5 text-white/60 hover:bg-white/10 text-[10px]">
                1:1
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts */}
          <div className="text-[10px] text-white/30 space-y-0.5 pt-2 border-t border-white/10">
            <p>Flechas / Espacio: navegar</p>
            <p>L: layout | N: navegacion | D: direccion</p>
            <p>B: marcador | A: modo anotar region</p>
            <p>+/-/0: zoom | Ctrl+rueda: zoom | Doble clic: zoom</p>
            <p>Inicio/Fin: primera/ultima pagina</p>
          </div>
        </div>
      )}

      {/* ---- VOICE COMMENTS PANEL ---- */}
      {ui.isPanelOpen('voice') && ui.showUI && (
        <div
          className="absolute top-12 right-3 z-[60] w-72 bg-zinc-900/95 backdrop-blur rounded-xl border border-white/10 shadow-2xl p-4"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <VoiceCommentsPanel
            fs={fs}
            filePath={filePath}
            currentLocation={`page:${currentPage + 1}`}
            variant="overlay"
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
            onAutoCreateAnnotation={(voiceId) => {
              const pageIdx = currentPage + 1;
              ann.autoCreateForVoice(
                voiceId,
                { index: pageIdx, fraction: totalPages > 0 ? pageIdx / totalPages : 0 },
                `Pagina ${pageIdx}`,
              );
            }}
          />
        </div>
      )}

      {/* ---- PROGRESS BAR ---- */}
      <div className="h-0.5 bg-white/10 shrink-0" style={{ position: 'absolute', top: ui.showUI ? 48 : 0, left: 0, right: 0, zIndex: 45, transition: 'top 0.3s ease' }}>
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* ---- CONTENT AREA ---- */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden"
        {...(!isScrollMode ? gestures.handlers : {})}
        onClick={isScrollMode ? handleScrollTap : undefined}
        style={{ touchAction: isScrollMode ? 'auto' : 'none', cursor: zoom > 1 ? 'grab' : 'default', minHeight: 0 }}
      >
        {isLoading && (
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-white/50">{loadingStatus}</p>
          </div>
        )}

        {error && (
          <div className="text-center space-y-3 max-w-md p-6">
            <p className="text-red-400 font-medium">Error</p>
            <p className="text-sm text-white/50">{error}</p>
            <button onClick={handleClose} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">
              Volver
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {navMode === 'paged' && renderPaged()}
            {navMode === 'scroll-v' && renderScrollV()}
            {navMode === 'scroll-h' && renderScrollH()}
          </>
        )}
      </div>

      {/* ---- ANNOTATE MODE BANNER ---- */}
      {annotateMode && !pendingRegion && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[55] px-4 py-2 bg-zinc-900/90 backdrop-blur rounded-lg border border-white/20 shadow-lg"
          onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <p className="text-xs text-white/80">Dibuja un rectangulo sobre la imagen para anotar</p>
        </div>
      )}

      {/* ---- COLOR PICKER FOR PENDING REGION ---- */}
      {pendingRegion && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2 px-3 py-2 bg-zinc-900/95 backdrop-blur rounded-xl border border-white/20 shadow-2xl"
          style={{ bottom: ui.showUI ? 72 : 16 }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <span className="text-xs text-white/60 mr-1">{categories.length > 0 ? 'Categoria:' : 'Color:'}</span>
          {categories.length > 0 ? (
            categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => addRegionAnnotation('yellow', cat.id)}
                className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white/50 transition-all hover:scale-110"
                style={{ background: hexToHighlightFill(cat.color) }}
                title={cat.name}
              />
            ))
          ) : (
            (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
              <button
                key={color}
                onClick={() => addRegionAnnotation(color)}
                className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white/50 transition-all hover:scale-110"
                style={{ background: HIGHLIGHT_COLORS[color].fill }}
                title={HIGHLIGHT_COLORS[color].label}
              />
            ))
          )}
          <button
            onClick={() => { setPendingRegion(null); }}
            className="ml-1 p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            title="Cancelar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ---- ANNOTATIONS PANEL (sidebar overlay) ---- */}
      {ui.isPanelOpen('annotations') && (
        <div
          className="absolute top-0 left-0 bottom-0 z-[55] w-80 max-w-[85vw]"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <AnnotationsPanel
            annotations={annotations}
            onNavigate={(a) => {
              if (a.position.index != null) {
                goToPage(a.position.index - 1);
              }
              setSelectedAnnotationId(a.id);
            }}
            onDelete={removeAnnotationAction}
            onEditNote={ann.updateNote}
            selectedAnnotationId={selectedAnnotationId}
            onVoiceClick={(annId) => {
              setVoiceAnnotationId(annId);
            }}
            theme={{ bg: 'rgb(24,24,27)', text: '#fff', border: 'rgba(255,255,255,0.1)', muted: 'rgba(255,255,255,0.4)' }}
            formatBookmarkLocation={(a) => ({
              title: `Pagina ${a.position.index ?? '?'}`,
              detail: a.chapter,
            })}
            formatHighlightLocation={(a) =>
              a.region
                ? `Region en pagina ${a.position.index ?? '?'}`
                : `Pagina ${a.position.index ?? '?'}`
            }
            fs={fs}
            filePath={filePath}
            currentLocation={`page:${currentPage + 1}`}
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
          />
        </div>
      )}

      {/* ---- VOICE PANEL for selected annotation ---- */}
      {voiceAnnotationId && ui.isPanelOpen('annotations') && (
        <div
          className="absolute top-12 z-[60] w-72 bg-zinc-900/95 backdrop-blur rounded-xl border border-white/10 shadow-2xl p-4"
          style={{ left: 'min(21rem, 86vw)' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-white/80">Audio de anotacion</h4>
            <button
              onClick={() => setVoiceAnnotationId(null)}
              className="p-1 hover:bg-white/10 rounded text-white/50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <VoiceCommentsPanel
            fs={fs}
            filePath={filePath}
            currentLocation={`page:${currentPage + 1}`}
            variant="overlay"
            annotationId={voiceAnnotationId}
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
          />
        </div>
      )}

      {/* ---- BOTTOM BAR ---- */}
      <footer
        className={`flex items-center justify-between px-3 py-2 bg-black/85 backdrop-blur-sm shrink-0 transition-all duration-300 ${
          ui.showUI ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50 }}
      >
        {/* Page navigation */}
        <button
          onClick={goBackward}
          disabled={pageLayout === 'dual' ? currentSpreadIndex <= 0 : currentPage <= 0}
          className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 text-white/70 transition-colors"
          title="Anterior"
        >
          <ChevronIcon direction={direction === 'rtl' ? 'right' : 'left'} />
        </button>

        {/* Page slider */}
        <div className="flex-1 mx-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="flex-1 h-1 accent-primary cursor-pointer"
            style={{ direction: direction === 'rtl' ? 'rtl' : 'ltr' }}
          />
          <div className="flex items-center gap-1.5 text-white/70 shrink-0">
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage + 1}
              onChange={(e) => goToPage(Number(e.target.value) - 1)}
              onClick={(e) => e.stopPropagation()}
              className="w-14 px-1.5 py-1 text-xs text-center rounded border border-white/20 bg-white/5 text-white focus:outline-none focus:border-primary"
            />
            <span className="text-xs text-white/40">/ {totalPages}</span>
          </div>
        </div>

        <button
          onClick={goForward}
          disabled={
            pageLayout === 'dual'
              ? currentSpreadIndex >= spreads.length - 1
              : currentPage >= totalPages - 1
          }
          className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 text-white/70 transition-colors"
          title="Siguiente"
        >
          <ChevronIcon direction={direction === 'rtl' ? 'left' : 'right'} />
        </button>
      </footer>
    </div>
  );
}
