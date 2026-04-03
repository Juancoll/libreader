import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition, NavItem } from 'epubjs';
import type { LocationChangedEvent, SpineSection, RenditionWithManager } from '@/types/epubjs';
import type Contents from 'epubjs/types/contents';
import type { FSAdapter } from '@/services/vaultParser';
import { writeAllReadingData } from '@/services/annotationWriter';
import type { Annotation, HighlightColor } from '@/types/annotation';
import { HIGHLIGHT_COLORS, isBookmark as isBookmarkAnnotation } from '@/types/annotation';
import {
  loadAnnotations, getHighlights,
  toBookmarkEntries, toHighlightEntries,
} from '@/services/annotationService';
import { getStorageKey, loadFromStorage, saveToStorage } from '@/hooks/useReaderStorage';
import { useReaderUI } from '@/hooks/useReaderUI';
import { useReaderKeyboard } from '@/hooks/useReaderKeyboard';
import { useReaderGestures } from '@/hooks/useReaderGestures';
import { useAnnotations } from '@/hooks/useAnnotations';
import { CloseIcon, BookmarkIcon, ChevronIcon, SearchIcon, AnnotationsBubbleIcon } from './ReaderIcons';
import { VoiceCommentsPanel, MicButtonIcon } from './VoiceCommentsPanel';
import { AnnotationPopup } from './AnnotationPopup';
import { AnnotationsPanel } from './AnnotationsPanel';
import { SearchPanel } from './SearchPanel';
import type { SearchResult } from './SearchPanel';
import { getTapZoneAction } from './tapZones';

// ---- Constants ----

// (MIN_ZOOM / MAX_ZOOM now in useReaderGestures)

// ---- Types ----

interface EpubReaderProps {
  filePath: string;
  fs: FSAdapter;
  onClose: () => void;
  onProgress?: (progress: number) => void;
}

type ViewMode = 'paginated' | 'scroll' | 'spread';
type ReaderTheme = 'light' | 'dark' | 'sepia';

interface TocItem {
  label: string;
  href: string;
  level: number;
}

// ---- Theme definitions ----

const READER_THEMES: Record<ReaderTheme, { body: Record<string, string>; bg: string; text: string; link: string }> = {
  light: {
    body: { color: '#1a1a1a', background: '#ffffff' },
    bg: '#ffffff',
    text: '#1a1a1a',
    link: '#6366f1',
  },
  dark: {
    body: { color: '#d4d4d8', background: '#18181b' },
    bg: '#18181b',
    text: '#d4d4d8',
    link: '#818cf8',
  },
  sepia: {
    body: { color: '#5b4636', background: '#f4ecd8' },
    bg: '#f4ecd8',
    text: '#5b4636',
    link: '#7b4c2a',
  },
};

const FONTS = [
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Literata', value: "'Literata', Georgia, serif" },
  { name: 'Sans-serif', value: 'system-ui, -apple-system, sans-serif' },
  { name: 'Monospace', value: 'ui-monospace, Consolas, monospace' },
];

// ---- Component ----

export function EpubReader({ filePath, fs, onClose, onProgress }: EpubReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const readerWrapperRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const handleCloseRef = useRef<() => void>(() => {});
  const navFlashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reading state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [bookTitle, setBookTitle] = useState('');
  const [chapter, setChapter] = useState('');
  const [currentCfi, setCurrentCfi] = useState('');

  // Visual feedback for tap navigation: 'left' | 'right' | null
  const [navFlash, setNavFlash] = useState<'left' | 'right' | null>(null);

  // Flag: set to true once rendition is created and displayed
  const [renditionReady, setRenditionReady] = useState(false);

  // TOC
  const [toc, setToc] = useState<TocItem[]>([]);

  // UI state (shared hook — replaces showToc, showSettings, showAnnotations, showVoicePanel, showUI)
  const ui = useReaderUI();

  // View settings (persisted per book)
  const settingsKey = getStorageKey('', filePath, 'settings');
  const savedSettings = loadFromStorage(settingsKey, {
    viewMode: 'paginated' as ViewMode,
    theme: 'light' as ReaderTheme,
    fontFamily: FONTS[0].value,
    fontSize: 100,
    lineHeight: 1.6,
    margin: 40,
  });

  const [viewMode, setViewMode] = useState<ViewMode>(savedSettings.viewMode);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(savedSettings.theme);
  const [fontFamily, setFontFamily] = useState(savedSettings.fontFamily);
  const [fontSize, setFontSize] = useState(savedSettings.fontSize);
  const [lineHeight, setLineHeight] = useState(savedSettings.lineHeight);
  const [margin, setMargin] = useState(savedSettings.margin);

  // Pinch-to-zoom & pan (shared hook — replaces manual zoom/pan state + 5 refs + gesture handlers)
  const gestures = useReaderGestures(
    {
      onSwipeForward: () => renditionRef.current?.next(),
      onSwipeBackward: () => renditionRef.current?.prev(),
      onTapZone: (clientX: number, clientY: number) => {
        const wrapper = readerWrapperRef.current;
        if (!wrapper) return;
        if (gestures.zoom > 1) { ui.toggleUI(); return; }
        const action = getTapZoneAction(clientX, clientY, wrapper.getBoundingClientRect());
        if (action === 'toggle-ui') ui.toggleUI();
        else if (action === 'prev') { renditionRef.current?.prev(); flashNav('left'); }
        else { renditionRef.current?.next(); flashNav('right'); }
      },
    },
    { disabled: viewMode === 'scroll' },
  );

  const { zoom, pan } = gestures;

  // Annotations (unified system — shared hook)
  const ann = useAnnotations(filePath);
  const { annotations, bookmarks } = ann;
  const [selectionPopup, setSelectionPopup] = useState<{ cfi: string; text: string; x: number; y: number } | null>(null);

  // Persist settings
  useEffect(() => {
    saveToStorage(settingsKey, { viewMode, theme: readerTheme, fontFamily, fontSize, lineHeight, margin });
  }, [viewMode, readerTheme, fontFamily, fontSize, lineHeight, margin, settingsKey]);

  // ---- Load book ----
  // Depends on viewMode so the rendition is recreated with the correct manager
  // (epub.js manager: 'default' vs 'continuous' cannot be changed after creation).
  useEffect(() => {
    let cancelled = false;

    async function loadBook() {
      if (!viewerRef.current) return;

      try {
        setIsLoading(true);
        setError(null);
        setRenditionReady(false);

        // If we already have a book but are just re-creating the rendition
        // for a viewMode change, destroy only the old rendition, not the book.
        if (renditionRef.current) {
          renditionRef.current.destroy();
          renditionRef.current = null;
        }

        let book = bookRef.current;
        let needsLocations = false;

        if (!book) {
          // First load: fetch binary and create Book
          const data = await fs.readBinaryFile(filePath);
          if (cancelled) return;

          book = ePub(data);
          bookRef.current = book;
          needsLocations = true;

          // Navigation & metadata only need loading once
          await book.loaded.navigation;
          if (book.navigation?.toc) {
            setToc(flattenToc(book.navigation.toc));
          }
          const metadata = await book.loaded.metadata;
          setBookTitle(metadata?.title || '');
        }

        if (cancelled) return;

        // Clear viewer element children (old rendition DOM)
        const viewerEl = viewerRef.current;
        while (viewerEl.firstChild) viewerEl.removeChild(viewerEl.firstChild);

        // Create rendition with correct manager for viewMode
        const opts = getRenditionOptions(viewMode);
        const rendition = book.renderTo(viewerEl, opts);
        renditionRef.current = rendition;

        // Register themes
        registerThemes(rendition);
        applyTheme(rendition, readerTheme, fontFamily, fontSize, lineHeight, margin);

        // Register highlight styles
        registerHighlightStyles(rendition);

        // Location tracking
        rendition.on('locationChanged', (loc: LocationChangedEvent) => {
          if (cancelled) return;
          const cfi = loc.start?.cfi || '';
          setCurrentCfi(cfi);

          if (book!.locations && book!.locations.length()) {
            const pct = book!.locations.percentageFromCfi(cfi);
            const p = Math.round(pct * 100);
            setProgress(p);
            onProgress?.(p);
          }

          // Save position
          saveToStorage(getStorageKey('', filePath, 'position'), cfi);
        });

        rendition.on('rendered', (section: SpineSection) => {
          if (cancelled) return;
          const navItem = book!.navigation.toc.find(
            (item: NavItem) => item.href && section.href?.includes(item.href.split('#')[0])
          );
          if (navItem) setChapter(navItem.label?.trim() || '');
        });

        // Text selection -> highlight popup
        // Convert iframe-local coordinates to wrapper-relative coordinates
        rendition.on('selected', (cfiRange: string, contents: Contents) => {
          if (cancelled) return;
          book!.getRange(cfiRange).then((range: Range | undefined) => {
            if (!range) return;
            const text = range.toString();
            if (text.length < 2) return;

            const sel = contents.window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (!rect || rect.width === 0) return;

            // rect is relative to the iframe viewport.
            // We need to convert to wrapper-relative coordinates.
            const wrapperEl = readerWrapperRef.current;
            if (!wrapperEl) return;

            // Find the iframe element in the parent DOM
            const iframe = wrapperEl.querySelector('iframe');
            if (iframe) {
              const iframeRect = iframe.getBoundingClientRect();
              const wrapperRect = wrapperEl.getBoundingClientRect();
              // Convert: iframe-local → page-absolute → wrapper-relative
              const absX = iframeRect.left + rect.left + rect.width / 2;
              const absY = iframeRect.top + rect.top;
              setSelectionPopup({
                cfi: cfiRange,
                text,
                x: absX - wrapperRect.left,
                y: absY - wrapperRect.top - 10,
              });
            }
          });
        });

        // Display: restore saved position or start from beginning
        const savedPos = loadFromStorage<string>(getStorageKey('', filePath, 'position'), '');
        if (savedPos) {
          await rendition.display(savedPos);
        } else {
          await rendition.display();
        }

        // Generate locations (only on first load)
        if (needsLocations) {
          await book.locations.generate(1024);
        }

        // Restore saved highlights
        restoreHighlights(rendition, getHighlights(loadAnnotations(filePath)));

        setIsLoading(false);
        setRenditionReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar el EPUB');
          setIsLoading(false);
        }
      }
    }

    loadBook();

    return () => {
      cancelled = true;
      // On full unmount (filePath change), destroy the book
      // On viewMode change, the next effect run will recreate the rendition
      if (renditionRef.current) {
        renditionRef.current.destroy();
        renditionRef.current = null;
      }
    };
  }, [filePath, fs, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy the Book object only when the component unmounts or filePath changes
  useEffect(() => {
    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, [filePath]);

  // ---- Apply settings changes to live rendition ----
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    applyTheme(r, readerTheme, fontFamily, fontSize, lineHeight, margin);
  }, [readerTheme, fontFamily, fontSize, lineHeight, margin]);

  // ---- Resize rendition when wrapper size changes (sidebar open/close) ----
  useEffect(() => {
    const wrapper = readerWrapperRef.current;
    if (!wrapper || !renditionReady) return;

    const observer = new ResizeObserver(() => {
      const r = renditionRef.current;
      if (!r) return;
      const { width, height } = wrapper.getBoundingClientRect();
      if (width > 0 && height > 0) {
        r.resize(width, height);
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [renditionReady]);

  // ---- View mode change ----
  // Setting viewMode triggers the loadBook effect which recreates the rendition
  // with the correct manager ('continuous' for scroll, 'default' for paginated/spread).
  // Position is automatically restored from localStorage.
  const changeViewMode = useCallback((mode: ViewMode) => {
    // Save current position so loadBook restores it
    if (currentCfi) {
    saveToStorage(getStorageKey('', filePath, 'position'), currentCfi);
    }
    setViewMode(mode);
  }, [currentCfi, filePath]);

  // ---- Tap zone navigation ----
  const flashNav = useCallback((dir: 'left' | 'right') => {
    setNavFlash(dir);
    clearTimeout(navFlashTimerRef.current);
    navFlashTimerRef.current = setTimeout(() => setNavFlash(null), 300);
  }, []);

  // Listen for clicks inside the epub.js iframe
  // Uses renditionReady so this effect runs AFTER the rendition is created and displayed.
  useEffect(() => {
    const r = renditionRef.current;
    if (!r || !renditionReady) return;

    if (viewMode === 'scroll') {
      // In scroll mode, we only need UI toggle on taps (no prev/next)
      const onIframeClickScroll = (event: MouseEvent) => {
        const sel = (event.view as Window)?.getSelection?.();
        if (sel && sel.toString().length > 0) return;

        const wrapper = readerWrapperRef.current;
        if (!wrapper) return;
        const iframe = wrapper.querySelector('iframe');
        if (iframe) {
          const iframeRect = iframe.getBoundingClientRect();
          const absX = iframeRect.left + event.clientX;
          const absY = iframeRect.top + event.clientY;
          const action = getTapZoneAction(absX, absY, wrapper.getBoundingClientRect());
          if (action === 'toggle-ui') {
            ui.toggleUI();
          }
          // In scroll mode, prev/next taps are ignored — user scrolls natively
        }
      };
      r.on('click', onIframeClickScroll);
      return () => { r.off('click', onIframeClickScroll); };
    }

    // Paginated / spread mode: full tap zone navigation
    const onIframeClick = (event: MouseEvent) => {
      // Don't navigate if user is selecting text
      const sel = (event.view as Window)?.getSelection?.();
      if (sel && sel.toString().length > 0) return;

      // Map iframe-relative coordinates to our wrapper
      const wrapper = readerWrapperRef.current;
      if (!wrapper) return;
      const iframe = wrapper.querySelector('iframe');
      if (iframe) {
        const iframeRect = iframe.getBoundingClientRect();
        const absX = iframeRect.left + event.clientX;
        const absY = iframeRect.top + event.clientY;

        const action = getTapZoneAction(absX, absY, wrapper.getBoundingClientRect());
        if (action === 'prev') {
          renditionRef.current?.prev();
          flashNav('left');
        } else if (action === 'next') {
          renditionRef.current?.next();
          flashNav('right');
        } else {
          ui.toggleUI();
        }
      }
    };

    r.on('click', onIframeClick);
    return () => {
      r.off('click', onIframeClick);
    };
  }, [viewMode, flashNav, renditionReady]);

  // Reset zoom on view mode change
  useEffect(() => { gestures.resetZoom(); }, [viewMode, gestures.resetZoom]);

  // ---- Keyboard navigation (shared hook) ----
  // Register on both window AND rendition (for iframe focus)
  useReaderKeyboard(
    {
      next: () => renditionRef.current?.next(),
      prev: () => renditionRef.current?.prev(),
      escape: () => {
        ui.cascadeClose(handleCloseRef.current, {
          selectionPopup: !!selectionPopup,
          clearSelection: () => setSelectionPopup(null),
        });
      },
    },
    renditionReady ? renditionRef.current : null,
  );

  // ---- Highlight actions ----
  const addHighlightFromSelection = useCallback((cfi: string, text: string, color: HighlightColor) => {
    ann.addHighlight({
      position: { cfi },
      textSelection: { text, cfiRange: cfi },
      color,
      chapter,
    });
    // Add to rendition
    const r = renditionRef.current;
    if (r) {
      r.annotations.highlight(cfi, {}, () => {}, `hl-${color}`, {
        fill: HIGHLIGHT_COLORS[color].fill,
        'fill-opacity': '1',
        'mix-blend-mode': 'multiply',
      });
    }
    setSelectionPopup(null);
    // Clear selection in iframe
    try {
      const doc = (r as RenditionWithManager)?.manager?.container?.querySelector('iframe')?.contentDocument;
      doc?.getSelection()?.removeAllRanges();
    } catch { /* ok */ }
  }, [ann, chapter]);

  const removeHighlightAction = useCallback((annotationId: string) => {
    const removed = ann.removeHighlight(annotationId);
    const cfi = removed?.textSelection?.cfiRange;
    if (cfi) renditionRef.current?.annotations.remove(cfi, 'highlight');
  }, [ann]);

  const addBookmarkAction = useCallback(() => {
    if (!currentCfi) return;
    if (bookmarks.some((b) => b.position.cfi === currentCfi)) return;
    ann.addBookmark({ cfi: currentCfi, fraction: progress / 100 }, chapter);
  }, [ann, currentCfi, chapter, progress, bookmarks]);

  const removeBookmarkAction = useCallback((annotationId: string) => {
    ann.removeBookmark(annotationId);
  }, [ann]);

  // Voice-annotation linking — delegated to shared hook

  const goTo = useCallback((cfi: string, opts?: { closePanel?: boolean }) => {
    renditionRef.current?.display(cfi);
    if (opts?.closePanel !== false) {
      ui.closePanel();
    }
  }, [ui]);

  const isBookmarked = bookmarks.some((b) => b.position.cfi === currentCfi);
  const currentBookmarkId = bookmarks.find((b) => b.position.cfi === currentCfi)?.id;
  const themeColors = READER_THEMES[readerTheme];

  // ---- In-reader search ----
  const handleEpubSearch = useCallback(async (query: string): Promise<SearchResult[]> => {
    const book = bookRef.current;
    if (!book) return [];
    const results: SearchResult[] = [];
    const spine = book.spine;
    // spine.each is sync, but we need to load each section
    const spineItems: SpineSection[] = [];
    spine.each((item: SpineSection) => spineItems.push(item));

    for (const item of spineItems) {
      try {
        await item.load(book.load.bind(book));
        const found: Array<{ cfi: string; excerpt: string }> = item.find(query);
        for (const match of found) {
          results.push({
            id: `${item.index}-${results.length}`,
            excerpt: match.excerpt,
            location: item.href?.split('/').pop()?.replace('.xhtml', '').replace('.html', '') || `Seccion ${item.index + 1}`,
            navData: match.cfi,
          });
        }
        item.unload();
      } catch {
        // Some sections may fail to load
      }
    }
    return results;
  }, []);

  const handleEpubSearchNavigate = useCallback((result: SearchResult) => {
    renditionRef.current?.display(result.navData as string);
  }, []);

  // ---- Save to vault on close ----
  const saveToVault = useCallback(async () => {
    try {
      const book = bookRef.current;
      const totalPages = book && book.locations.length()
        ? book.locations.length()
        : 0;

      await writeAllReadingData(fs, filePath, {
        state: {
          file: filePath.split('/').pop() || filePath,
          format: 'epub',
          currentPage: Math.round(progress / 100 * totalPages),
          totalPages,
          progress: progress / 100,
          lastRead: new Date().toISOString(),
          epubCfi: currentCfi || undefined,
          pageLayout: viewMode === 'spread' ? 'spread' : viewMode === 'scroll' ? 'scroll' : 'single',
          readingDirection: 'ltr',
        },
        bookmarks: toBookmarkEntries(annotations, totalPages),
        highlights: toHighlightEntries(annotations),
      });
    } catch (err) {
      console.warn('Failed to save reading data to vault:', err);
    }
  }, [fs, filePath, progress, currentCfi, viewMode, annotations]);

  const handleClose = useCallback(async () => {
    await saveToVault();
    onClose();
  }, [saveToVault, onClose]);

  // Keep the ref in sync so the keyboard effect can use it without a stale closure
  handleCloseRef.current = handleClose;

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: themeColors.bg }}>
      {/* ---- TOP BAR ---- */}
      <header
        className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 py-2 transition-all duration-300 ${
          ui.showUI ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ borderBottom: `1px solid ${readerTheme === 'dark' ? '#333' : '#e0e0e0'}`, background: themeColors.bg }}>
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleClose} className="p-2 rounded-lg hover:opacity-70" title="Cerrar (Esc)">
            <CloseIcon color={themeColors.text} />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: themeColors.text }}>{bookTitle}</h2>
            {chapter && <p className="text-xs truncate" style={{ color: themeColors.text, opacity: 0.5 }}>{chapter}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Bookmark */}
          <button onClick={isBookmarked && currentBookmarkId ? () => removeBookmarkAction(currentBookmarkId) : addBookmarkAction}
            className="p-2 rounded-lg hover:opacity-70" title={isBookmarked ? 'Quitar marcador' : 'Marcar pagina'}>
            <BookmarkIcon color={themeColors.text} filled={isBookmarked} />
          </button>

          {/* View mode cycle */}
          <button onClick={() => changeViewMode(viewMode === 'paginated' ? 'scroll' : viewMode === 'scroll' ? 'spread' : 'paginated')}
            className="p-2 rounded-lg hover:opacity-70" title={`Modo: ${viewMode === 'paginated' ? 'Pagina' : viewMode === 'scroll' ? 'Scroll' : 'Doble pagina'}`}>
            <ViewModeIcon mode={viewMode} color={themeColors.text} />
          </button>

          {/* Settings */}
          <button onClick={() => ui.togglePanel('settings')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('settings') ? 'bg-primary/20' : 'hover:opacity-70'}`}
            title="Ajustes de lectura">
            <SettingsIcon color={themeColors.text} />
          </button>

          {/* TOC */}
          <button onClick={() => ui.togglePanel('toc')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('toc') ? 'bg-primary/20' : 'hover:opacity-70'}`}
            title="Tabla de contenidos">
            <TocIcon color={themeColors.text} />
          </button>

          {/* Annotations panel */}
          <button onClick={() => ui.togglePanel('annotations')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('annotations') ? 'bg-primary/20' : 'hover:opacity-70'}`}
            title="Anotaciones y marcadores">
            <AnnotationsBubbleIcon color={themeColors.text} />
          </button>

          {/* Search */}
          <button onClick={() => ui.togglePanel('search')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('search') ? 'bg-primary/20' : 'hover:opacity-70'}`}
            title="Buscar en el libro (Ctrl+F)">
            <SearchIcon color={themeColors.text} />
          </button>

          {/* Voice comments */}
          <button onClick={() => ui.togglePanel('voice')}
            className={`p-2 rounded-lg transition-colors ${ui.isPanelOpen('voice') ? 'bg-primary/20' : 'hover:opacity-70'}`}
            title="Comentarios de voz">
            <MicButtonIcon color={themeColors.text} />
          </button>
        </div>
      </header>

      {/* Progress bar (absolute, follows header) */}
      <div className="absolute left-0 right-0 z-[39] h-0.5 transition-all duration-300"
        style={{ top: ui.showUI ? 48 : 0, background: readerTheme === 'dark' ? '#333' : '#e8e8e8' }}>
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* ---- CONTENT AREA (full height, bars overlay) ---- */}
      <div className="flex-1 flex overflow-hidden relative" style={{ minHeight: 0 }}>

        {/* ---- SETTINGS PANEL ---- */}
        {ui.isPanelOpen('settings') && (
          <aside className="w-80 border-r overflow-y-auto shrink-0 p-4 space-y-5"
            style={{ borderColor: readerTheme === 'dark' ? '#333' : '#e0e0e0', background: themeColors.bg }}>
            <h3 className="text-sm font-semibold" style={{ color: themeColors.text }}>Ajustes de lectura</h3>

            {/* Theme */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: themeColors.text, opacity: 0.6 }}>Tema</label>
              <div className="flex gap-2">
                {(Object.keys(READER_THEMES) as ReaderTheme[]).map((t) => (
                  <button key={t} onClick={() => setReaderTheme(t)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border-2 transition-colors ${readerTheme === t ? 'border-primary' : 'border-transparent'}`}
                    style={{ background: READER_THEMES[t].bg, color: READER_THEMES[t].text,
                      border: readerTheme === t ? '2px solid #6366f1' : `2px solid ${readerTheme === 'dark' ? '#444' : '#ddd'}` }}>
                    {t === 'light' ? 'Claro' : t === 'dark' ? 'Oscuro' : 'Sepia'}
                  </button>
                ))}
              </div>
            </div>

            {/* View mode */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: themeColors.text, opacity: 0.6 }}>Modo de vista</label>
              <div className="flex gap-2">
                {([['paginated', 'Pagina'], ['scroll', 'Scroll'], ['spread', 'Doble']] as const).map(([mode, label]) => (
                  <button key={mode} onClick={() => changeViewMode(mode)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors`}
                    style={{
                      background: viewMode === mode ? '#6366f1' : (readerTheme === 'dark' ? '#2a2a2e' : '#f0f0f0'),
                      color: viewMode === mode ? '#fff' : themeColors.text,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font family */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: themeColors.text, opacity: 0.6 }}>Fuente</label>
              <div className="grid grid-cols-2 gap-2">
                {FONTS.map((f) => (
                  <button key={f.name} onClick={() => setFontFamily(f.value)}
                    className="py-2 px-3 rounded-lg text-xs transition-colors"
                    style={{
                      fontFamily: f.value,
                      background: fontFamily === f.value ? '#6366f1' : (readerTheme === 'dark' ? '#2a2a2e' : '#f0f0f0'),
                      color: fontFamily === f.value ? '#fff' : themeColors.text,
                    }}>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <SliderSetting label="Tamano de fuente" value={fontSize} min={60} max={200} step={10}
              display={`${fontSize}%`} theme={themeColors}
              onChange={setFontSize} />

            {/* Line height */}
            <SliderSetting label="Interlineado" value={lineHeight} min={1.0} max={2.5} step={0.1}
              display={`${lineHeight.toFixed(1)}`} theme={themeColors}
              onChange={setLineHeight} />

            {/* Margins */}
            <SliderSetting label="Margenes" value={margin} min={0} max={80} step={10}
              display={`${margin}px`} theme={themeColors}
              onChange={setMargin} />
          </aside>
        )}

        {/* ---- TOC PANEL ---- */}
        {ui.isPanelOpen('toc') && (
          <aside className="w-72 border-r overflow-y-auto shrink-0"
            style={{ borderColor: readerTheme === 'dark' ? '#333' : '#e0e0e0', background: themeColors.bg }}>
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3" style={{ color: themeColors.text }}>Contenidos</h3>
              <nav className="space-y-0.5">
                {toc.map((item, i) => (
                  <button key={i} onClick={() => goTo(item.href)}
                    className="block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors truncate hover:opacity-80"
                    style={{ color: themeColors.text, paddingLeft: `${12 + item.level * 16}px`,
                      background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = readerTheme === 'dark' ? '#2a2a2e' : '#f0f0f0')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        )}

        {/* ---- ANNOTATIONS PANEL ---- */}
        {ui.isPanelOpen('annotations') && (
          <AnnotationsPanel
            annotations={annotations}
            onNavigate={(a) => {
              const cfi = a.position.cfi || a.textSelection?.cfiRange;
              if (cfi) goTo(cfi, { closePanel: false });
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
            theme={{
              bg: themeColors.bg,
              text: themeColors.text,
              border: readerTheme === 'dark' ? '#333' : '#e0e0e0',
              muted: undefined,
            }}
            formatBookmarkLocation={(a) => ({
              title: a.chapter || 'Sin titulo',
              detail: a.position.fraction != null ? `${Math.round(a.position.fraction * 100)}%` : undefined,
            })}
            fs={fs}
            filePath={filePath}
            currentLocation={currentCfi || `progress:${progress}%`}
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
          />
        )}

        {/* ---- VOICE COMMENTS PANEL ---- */}
        {ui.isPanelOpen('voice') && (
          <aside className="w-80 border-r overflow-y-auto shrink-0"
            style={{ borderColor: readerTheme === 'dark' ? '#333' : '#e0e0e0', background: themeColors.bg }}>
            <VoiceCommentsPanel
              fs={fs}
              filePath={filePath}
              currentLocation={currentCfi || `progress:${progress}%`}
              variant="sidebar"
              theme={{ bg: themeColors.bg, text: themeColors.text, border: readerTheme === 'dark' ? '#333' : '#eee' }}
              onVoiceLinked={ann.voiceLinked}
              onVoiceUnlinked={ann.voiceUnlinked}
              onAutoCreateAnnotation={(voiceId) => {
                if (!currentCfi) return;
                ann.autoCreateForVoice(voiceId, { cfi: currentCfi, fraction: progress / 100 }, chapter);
              }}
            />
          </aside>
        )}

        {/* ---- SEARCH PANEL ---- */}
        {ui.isPanelOpen('search') && (
          <SearchPanel
            onSearch={handleEpubSearch}
            onNavigate={handleEpubSearchNavigate}
            theme={{
              bg: themeColors.bg,
              text: themeColors.text,
              border: readerTheme === 'dark' ? '#333' : '#e0e0e0',
              muted: undefined,
            }}
          />
        )}

        {/* ---- READER ---- */}
        <div
          ref={readerWrapperRef}
          className={`flex-1 relative ${viewMode === 'scroll' ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'}`}
          {...(viewMode !== 'scroll' ? gestures.handlers : {})}
          style={{
            touchAction: viewMode === 'scroll' ? 'auto' : 'none',
            cursor: zoom > 1 ? 'grab' : 'default',
          }}
        >
          {/* Loading */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: themeColors.bg }}>
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm" style={{ color: themeColors.text, opacity: 0.5 }}>Cargando libro...</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: themeColors.bg }}>
              <div className="text-center space-y-3 max-w-md p-6">
                <p className="text-danger font-medium">Error al cargar el EPUB</p>
                <p className="text-sm" style={{ color: themeColors.text, opacity: 0.5 }}>{error}</p>
                <button onClick={handleClose} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Volver</button>
              </div>
            </div>
          )}

          {/* Selection popup (highlight action) */}
          {selectionPopup && (
            <AnnotationPopup
              x={selectionPopup.x}
              y={selectionPopup.y}
              onHighlight={(color) => addHighlightFromSelection(selectionPopup.cfi, selectionPopup.text, color)}
              onDismiss={() => setSelectionPopup(null)}
              theme={{
                bg: readerTheme === 'dark' ? '#2a2a2e' : '#fff',
                border: readerTheme === 'dark' ? '#444' : '#ddd',
                text: themeColors.text,
              }}
            />
          )}

          {/* Nav flash feedback (paginated/spread mode only) */}
          {viewMode !== 'scroll' && zoom <= 1 && (
            <>
              {navFlash === 'left' && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none animate-pulse">
                  <span className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
                    style={{ background: `${themeColors.bg}dd` }}>
                    <ChevronIcon direction="left" color={themeColors.text} />
                  </span>
                </div>
              )}
              {navFlash === 'right' && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-none animate-pulse">
                  <span className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
                    style={{ background: `${themeColors.bg}dd` }}>
                    <ChevronIcon direction="right" color={themeColors.text} />
                  </span>
                </div>
              )}
            </>
          )}

          {/* EPUB render target */}
          <div
            className="w-full h-full"
            style={{
              transform: zoom > 1 ? `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` : undefined,
              transformOrigin: 'center center',
              transition: zoom === 1 ? 'transform 0.2s ease' : 'none',
            }}
          >
            <div ref={viewerRef} className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* ---- BOTTOM BAR ---- */}
      <footer
        className={`absolute bottom-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-1.5 transition-all duration-300 ${
          ui.showUI ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ borderTop: `1px solid ${readerTheme === 'dark' ? '#333' : '#e0e0e0'}`, background: themeColors.bg }}>
        <span className="text-xs font-medium" style={{ color: themeColors.text, opacity: 0.5 }}>{progress}%</span>
        <input type="range" min={0} max={100} value={progress}
          onChange={(e) => {
            const pct = Number(e.target.value) / 100;
            const book = bookRef.current;
            if (book && book.locations.length()) {
              const cfi = book.locations.cfiFromPercentage(pct);
              renditionRef.current?.display(cfi);
            }
          }}
          className="flex-1 mx-4 h-1 accent-primary cursor-pointer" />
        <span className="text-xs" style={{ color: themeColors.text, opacity: 0.4 }}>
          {viewMode === 'paginated' ? 'Pagina' : viewMode === 'scroll' ? 'Scroll' : 'Doble'}
        </span>
      </footer>
    </div>
  );
}

// ---- Helper components ----

function SliderSetting({ label, value, min, max, step, display, theme, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; theme: { text: string; bg: string };
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium" style={{ color: theme.text, opacity: 0.6 }}>{label}</label>
        <span className="text-xs font-mono" style={{ color: theme.text, opacity: 0.5 }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-primary cursor-pointer" />
    </div>
  );
}

// ---- epub.js helpers ----

function getRenditionOptions(mode: ViewMode) {
  const base = { width: '100%', height: '100%' };
  switch (mode) {
    case 'scroll':
      return { ...base, manager: 'continuous', flow: 'scrolled', spread: 'none' };
    case 'spread':
      return { ...base, flow: 'paginated', spread: 'always', minSpreadWidth: 0 };
    default:
      return { ...base, flow: 'paginated', spread: 'none' };
  }
}

function registerThemes(rendition: Rendition) {
  for (const [name, theme] of Object.entries(READER_THEMES)) {
    rendition.themes.register(name, {
      body: {
        color: `${theme.body.color} !important`,
        background: `${theme.body.background} !important`,
      },
      a: { color: `${theme.link} !important` },
    });
  }
}

function applyTheme(rendition: Rendition, theme: ReaderTheme, font: string, size: number, lh: number, margin: number) {
  rendition.themes.select(theme);
  rendition.themes.fontSize(`${size}%`);
  rendition.themes.font(font);
  rendition.themes.override('line-height', `${lh}`);
  rendition.themes.override('padding', `0 ${margin}px`);
}

function registerHighlightStyles(rendition: Rendition) {
  const rules: Record<string, Record<string, string>> = {};
  for (const [name, cfg] of Object.entries(HIGHLIGHT_COLORS)) {
    rules[`.hl-${name}`] = {
      fill: cfg.fill,
      'fill-opacity': '1',
      'mix-blend-mode': 'multiply',
    };
  }
  rendition.themes.default(rules);
}

function restoreHighlights(rendition: Rendition, highlights: Annotation[]) {
  for (const hl of highlights) {
    const cfi = hl.textSelection?.cfiRange;
    if (!cfi) continue;
    try {
      rendition.annotations.highlight(cfi, {}, () => {}, `hl-${hl.style.color}`, {
        fill: HIGHLIGHT_COLORS[hl.style.color].fill,
        'fill-opacity': '1',
        'mix-blend-mode': 'multiply',
      });
    } catch { /* CFI may be invalid */ }
  }
}

function flattenToc(items: NavItem[], level = 0): TocItem[] {
  const result: TocItem[] = [];
  for (const item of items) {
    result.push({ label: item.label?.trim() || '', href: item.href || '', level });
    if (item.subitems?.length) {
      result.push(...flattenToc(item.subitems, level + 1));
    }
  }
  return result;
}

// ---- Icons (Epub-specific, not shared) ----

function TocIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ViewModeIcon({ mode, color }: { mode: ViewMode; color: string }) {
  if (mode === 'scroll') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="12" y2="18" />
      </svg>
    );
  }
  if (mode === 'spread') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="9" height="18" rx="1" /><rect x="14" y="3" width="9" height="18" rx="1" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
    </svg>
  );
}
