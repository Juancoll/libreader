/**
 * VideoReader — fullscreen YouTube video player with annotations.
 *
 * Reads .youtube files (plain text with a YouTube URL) and renders a
 * fullscreen player using the YouTube IFrame API with:
 * - Position persistence (resume where you left off)
 * - Time-range annotations (highlight a segment of video)
 * - Timestamp bookmarks
 * - Active annotation overlay during playback
 * - Custom timeline with bookmark dots and annotation range bars
 * - Vault write-back on close
 * - Keyboard shortcuts: Space, B, A, arrows, Escape
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { FSAdapter } from '@/services/vaultParser';
import type { Annotation, HighlightColor } from '@/types/annotation';
import { HIGHLIGHT_COLORS, hexToHighlightFill, resolveAnnotationFill } from '@/types/annotation';
import {
  toBookmarkEntries, toHighlightEntries,
} from '@/services/annotationService';
import { writeAllReadingData } from '@/services/annotationWriter';
import { useReaderUI } from '@/hooks/useReaderUI';
import { useReaderKeyboard } from '@/hooks/useReaderKeyboard';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useLibraryStore } from '@/store/libraryStore';
import { AnnotationsPanel } from './AnnotationsPanel';
import { VoiceCommentsPanel } from './VoiceCommentsPanel';

// ---- Types ----

interface VideoReaderProps {
  filePath: string;
  fs: FSAdapter;
  onClose: () => void;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

type AnnotatePhase = 'idle' | 'marking-end' | 'picking-color';

const YT_PLAYING = 1;

// ---- YouTube IFrame API loader (singleton) ----

let ytApiLoaded = false;
let ytApiLoading = false;
const ytApiCallbacks: (() => void)[] = [];

function loadYouTubeApi(): Promise<void> {
  if (ytApiLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve);
    if (ytApiLoading) return;
    ytApiLoading = true;

    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      ytApiLoading = false;
      for (const cb of ytApiCallbacks) cb();
      ytApiCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
}

// ---- Helpers ----

function extractVideoId(url: string): string | null {
  const trimmed = url.trim();
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getPositionKey(filePath: string): string {
  return `libreader:video:${filePath}:position`;
}

function loadSavedPosition(filePath: string): number {
  try {
    const raw = localStorage.getItem(getPositionKey(filePath));
    return raw ? parseFloat(raw) : 0;
  } catch { return 0; }
}

function savePosition(filePath: string, time: number): void {
  try {
    localStorage.setItem(getPositionKey(filePath), String(time));
  } catch { /* quota */ }
}

// ---- Component ----

export function VideoReader({ filePath, fs, onClose }: VideoReaderProps) {
  // Video state
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const ui = useReaderUI();
  const categories = useLibraryStore((s) => s.annotationCategories);

  // Annotations (shared hook)
  const ann = useAnnotations(filePath);
  const { annotations, bookmarks: bookmarksList, highlights } = ann;

  // Annotation creation flow
  const [annotatePhase, setAnnotatePhase] = useState<AnnotatePhase>('idle');
  const [annotateStart, setAnnotateStart] = useState(0);
  const [annotateEnd, setAnnotateEnd] = useState(0);
  const [colorPickerPos, setColorPickerPos] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /* uiTimeoutRef removed — UI overlay is now a pure toggle, no auto-hide */
  const savedPosRef = useRef(loadSavedPosition(filePath));

  // ---- Load .youtube file ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await fs.readFile(filePath);
        if (cancelled) return;
        const id = extractVideoId(content);
        if (!id) {
          setError('No se pudo extraer el ID del video de YouTube');
          setIsLoading(false);
          return;
        }
        setVideoId(id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar el archivo');
          setIsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [filePath, fs]);

  // ---- Initialize YouTube player ----
  useEffect(() => {
    if (!videoId) return;
    let destroyed = false;

    (async () => {
      await loadYouTubeApi();
      if (destroyed || !playerDivRef.current) return;

      const YT = (window as any).YT;
      new YT.Player(playerDivRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          start: Math.floor(savedPosRef.current),
        },
        events: {
          onReady: (event: any) => {
            if (destroyed) return;
            playerRef.current = event.target as YTPlayer;
            const dur = event.target.getDuration();
            setDuration(dur);
            setIsLoading(false);
            if (savedPosRef.current > 0) {
              event.target.seekTo(savedPosRef.current, true);
              setCurrentTime(savedPosRef.current);
            }
          },
          onStateChange: (event: any) => {
            if (destroyed) return;
            setIsPlaying(event.data === YT_PLAYING);
            if (event.data === YT_PLAYING) {
              const dur = (event.target as YTPlayer).getDuration();
              if (dur > 0) setDuration(dur);
            }
          },
        },
      });
    })();

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ok */ }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // ---- Progress tick ----
  useEffect(() => {
    if (isPlaying) {
      tickRef.current = setInterval(() => {
        if (playerRef.current) {
          const t = playerRef.current.getCurrentTime();
          setCurrentTime(t);
          savePosition(filePath, t);
        }
      }, 500);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isPlaying, filePath]);

  // ---- Playback controls ----
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, [isPlaying]);

  const seek = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const t = Math.max(0, Math.min(duration, playerRef.current.getCurrentTime() + seconds));
    playerRef.current.seekTo(t, true);
    setCurrentTime(t);
    savePosition(filePath, t);
  }, [duration, filePath]);

  const seekTo = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const t = Math.max(0, Math.min(duration, seconds));
    playerRef.current.seekTo(t, true);
    setCurrentTime(t);
    savePosition(filePath, t);
  }, [duration, filePath]);

  // ---- Bookmark ----
  const toggleBookmark = useCallback(() => {
    const fraction = duration > 0 ? currentTime / duration : 0;
    ann.toggleBookmark(
      (bm) => Math.abs((bm.position.timeStart ?? -1) - currentTime) < 2,
      { timeStart: currentTime, fraction },
      formatTime(currentTime),
    );
  }, [ann, currentTime, duration]);

  // ---- Annotation creation flow ----
  const startAnnotation = useCallback(() => {
    if (annotatePhase !== 'idle') {
      setAnnotatePhase('idle');
      setColorPickerPos(null);
      return;
    }
    if (playerRef.current) playerRef.current.pauseVideo();
    setAnnotateStart(currentTime);
    setAnnotateEnd(currentTime);
    setAnnotatePhase('marking-end');
  }, [annotatePhase, currentTime]);

  const confirmAnnotateEnd = useCallback(() => {
    if (annotatePhase !== 'marking-end') return;
    if (playerRef.current) playerRef.current.pauseVideo();
    const t = playerRef.current?.getCurrentTime() ?? currentTime;
    setAnnotateEnd(t);
    setAnnotatePhase('picking-color');
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setColorPickerPos({ x: rect.width / 2, y: rect.height / 2 });
    }
  }, [annotatePhase, currentTime]);

  const handlePickColor = useCallback((color: HighlightColor, categoryId?: string) => {
    const start = Math.min(annotateStart, annotateEnd);
    const end = Math.max(annotateStart, annotateEnd);
    const fraction = duration > 0 ? start / duration : 0;
    ann.addHighlight({
      position: { timeStart: start, timeEnd: end, fraction },
      color,
      categoryId,
      chapter: `${formatTime(start)} - ${formatTime(end)}`,
    });
    setAnnotatePhase('idle');
    setColorPickerPos(null);
  }, [annotateStart, annotateEnd, duration, ann]);

  const cancelAnnotation = useCallback(() => {
    setAnnotatePhase('idle');
    setColorPickerPos(null);
  }, []);

  // ---- Delete / edit ----
  const handleDelete = useCallback((id: string) => {
    ann.removeAnnotationById(id);
  }, [ann]);

  const handleEditNote = useCallback((id: string, note: string) => {
    ann.updateNote(id, note);
  }, [ann]);

  const handleNavigate = useCallback((ann: Annotation) => {
    if (ann.position.timeStart != null) seekTo(ann.position.timeStart);
  }, [seekTo]);

  // ---- Active annotations ----
  const activeAnnotations = useMemo(() => {
    return highlights.filter((hl) =>
      hl.position.timeStart != null &&
      hl.position.timeEnd != null &&
      currentTime >= hl.position.timeStart &&
      currentTime <= hl.position.timeEnd
    );
  }, [highlights, currentTime]);

  // ---- Vault write-back on close ----
  const handleClose = useCallback(async () => {
    const t = playerRef.current?.getCurrentTime() ?? currentTime;
    const d = playerRef.current?.getDuration() ?? duration;
    const fraction = d > 0 ? t / d : 0;

    try {
      await writeAllReadingData(fs, filePath, {
        state: {
          file: filePath.split('/').pop() || filePath,
          format: 'youtube',
          currentPage: Math.floor(t),
          totalPages: Math.floor(d),
          progress: fraction,
          lastRead: new Date().toISOString(),
          currentTime: t,
          duration: d,
        },
        bookmarks: toBookmarkEntries(annotations, Math.floor(d)),
        highlights: toHighlightEntries(annotations, categories),
      });
    } catch { /* best effort */ }

    savePosition(filePath, t);
    onClose();
  }, [currentTime, duration, annotations, categories, filePath, fs, onClose]);

  // ---- Keyboard shortcuts ----
  useReaderKeyboard({
    space: togglePlayPause,
    bookmark: toggleBookmark,
    annotate: () => {
      if (annotatePhase === 'marking-end') confirmAnnotateEnd();
      else startAnnotation();
    },
    prev: () => seek(-10),
    next: () => seek(10),
    escape: () => ui.cascadeClose(handleClose, {
      annotateMode: annotatePhase !== 'idle',
      clearAnnotateMode: cancelAnnotation,
    }),
  });

  // ---- Voice linking ----
  const handleAutoCreateAnnotation = useCallback((voiceId: string) => {
    const fraction = duration > 0 ? currentTime / duration : 0;
    ann.autoCreateForVoice(voiceId, { timeStart: currentTime, fraction }, formatTime(currentTime));
  }, [ann, currentTime, duration]);

  // ---- Timeline click ----
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(fraction * duration);
  }, [duration, seekTo]);

  const isNearBookmark = useMemo(() => {
    return bookmarksList.some((bm) => Math.abs((bm.position.timeStart ?? -1) - currentTime) < 2);
  }, [bookmarksList, currentTime]);

  // ---- Render ----

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <p className="text-red-400 text-lg">{error}</p>
          <button onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-black flex">
      {/* Loading overlay — on top of everything while loading */}
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-black flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-white/50">Cargando video...</p>
          </div>
        </div>
      )}
      {/* Annotations panel (left sidebar) */}
      {ui.isPanelOpen('annotations') && (
        <AnnotationsPanel
          annotations={annotations}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onEditNote={handleEditNote}
          formatBookmarkLocation={(ann) => ({
            title: ann.position.timeStart != null ? formatTime(ann.position.timeStart) : 'Sin posicion',
            detail: ann.chapter,
          })}
          formatHighlightLocation={(ann) => {
            if (ann.position.timeStart != null && ann.position.timeEnd != null) {
              return `${formatTime(ann.position.timeStart)} - ${formatTime(ann.position.timeEnd)}`;
            }
            return '';
          }}
          fs={fs}
          filePath={filePath}
          currentLocation={`time:${Math.floor(currentTime)}`}
          onVoiceLinked={ann.voiceLinked}
          onVoiceUnlinked={ann.voiceUnlinked}
        />
      )}

      {/* Main video area */}
      <div className="flex-1 relative flex flex-col" data-video-area>
        {/* YouTube player container */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={playerDivRef} className="absolute inset-0" />

          {/* Click overlay for play/pause + UI toggle */}
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); togglePlayPause(); ui.toggleUI(); }}
          />

          {/* Active annotation overlays */}
          {activeAnnotations.length > 0 && (
            <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none space-y-1">
              {activeAnnotations.map((ann) => (
                <div
                  key={ann.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white/90"
                  style={{
                    background: resolveAnnotationFill(ann.style, categories).replace(/[\d.]+\)$/, '0.7)'),
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {ann.note || ann.chapter || `${formatTime(ann.position.timeStart ?? 0)} - ${formatTime(ann.position.timeEnd ?? 0)}`}
                </div>
              ))}
            </div>
          )}

          {/* Annotate mode indicator */}
          {annotatePhase !== 'idle' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-black/80 text-white text-sm text-center">
              {annotatePhase === 'marking-end' && (
                <>
                  <p className="font-medium">Inicio: {formatTime(annotateStart)}</p>
                  <p className="text-white/60 text-xs">
                    Navega al final y pulsa <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px]">A</kbd>
                  </p>
                </>
              )}
              {annotatePhase === 'picking-color' && (
                <p className="font-medium">Selecciona un color</p>
              )}
            </div>
          )}

          {/* Color picker */}
          {annotatePhase === 'picking-color' && colorPickerPos && (
            <div
              className="absolute z-30 flex items-center gap-1 p-2 rounded-lg shadow-lg bg-black/90 border border-white/20"
              style={{ left: colorPickerPos.x - 100, top: colorPickerPos.y - 25 }}
            >
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handlePickColor('yellow', cat.id)}
                    className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white/50 transition-all hover:scale-110"
                    style={{ background: hexToHighlightFill(cat.color) }}
                    title={cat.name}
                  />
                ))
              ) : (
                (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
                  <button
                    key={color}
                    onClick={() => handlePickColor(color)}
                    className="w-8 h-8 rounded-full border-2 border-transparent hover:border-white/50 transition-all hover:scale-110"
                    style={{ background: HIGHLIGHT_COLORS[color].fill }}
                    title={HIGHLIGHT_COLORS[color].label}
                  />
                ))
              )}
              <button onClick={cancelAnnotation} className="ml-1 p-1 text-white/50 hover:text-white">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Paused overlay */}
          {!isPlaying && annotatePhase === 'idle' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Header */}
        <div className={`absolute top-0 left-0 right-0 z-30 transition-opacity duration-300 ${ui.showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
            <button onClick={handleClose} className="p-2 text-white/80 hover:text-white" title="Cerrar (Esc)">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="flex-1" />
            <button onClick={toggleBookmark} className={`p-2 transition-colors ${isNearBookmark ? 'text-yellow-400' : 'text-white/80 hover:text-white'}`} title="Marcador (B)">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill={isNearBookmark ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button onClick={() => annotatePhase === 'marking-end' ? confirmAnnotateEnd() : startAnnotation()} className={`p-2 transition-colors ${annotatePhase !== 'idle' ? 'text-green-400' : 'text-white/80 hover:text-white'}`} title={annotatePhase === 'marking-end' ? 'Confirmar fin (A)' : 'Anotar (A)'}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            <button onClick={() => ui.togglePanel('annotations')} className={`p-2 transition-colors ${ui.isPanelOpen('annotations') ? 'text-primary' : 'text-white/80 hover:text-white'}`} title="Anotaciones">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </button>
            <button onClick={() => ui.togglePanel('voice')} className={`p-2 transition-colors ${ui.isPanelOpen('voice') ? 'text-primary' : 'text-white/80 hover:text-white'}`} title="Voz">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          </div>
        </div>

        {/* Footer: timeline + controls */}
        <div className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${ui.showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="px-4 pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent space-y-2">
            {/* Timeline */}
            <div className="relative h-6 cursor-pointer group" onClick={handleTimelineClick}>
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-white/20 rounded-full group-hover:h-1.5 transition-all">
                <div className="absolute inset-y-0 left-0 bg-red-500 rounded-full" style={{ width: `${progress * 100}%` }} />
                {/* Annotation range bars */}
                {highlights.map((hl) => {
                  if (hl.position.timeStart == null || hl.position.timeEnd == null || duration <= 0) return null;
                  const left = (hl.position.timeStart / duration) * 100;
                  const width = ((hl.position.timeEnd - hl.position.timeStart) / duration) * 100;
                  return (
                    <div key={hl.id} className="absolute top-0 bottom-0 rounded-full opacity-60" style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, background: resolveAnnotationFill(hl.style, categories) }} title={hl.chapter || ''} />
                  );
                })}
                {/* Bookmark dots */}
                {bookmarksList.map((bm) => {
                  if (bm.position.timeStart == null || duration <= 0) return null;
                  const pos = (bm.position.timeStart / duration) * 100;
                  return (
                    <div key={bm.id} className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-600" style={{ left: `${pos}%`, marginLeft: '-5px' }} title={`Marcador: ${formatTime(bm.position.timeStart)}`} />
                  );
                })}
              </div>
              {/* Playhead */}
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-500 shadow-lg" style={{ left: `${progress * 100}%`, marginLeft: '-6px' }} />
              {/* Annotate range preview */}
              {annotatePhase === 'marking-end' && duration > 0 && (
                <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-green-400/40 rounded-full" style={{ left: `${(Math.min(annotateStart, currentTime) / duration) * 100}%`, width: `${(Math.abs(currentTime - annotateStart) / duration) * 100}%` }} />
              )}
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3 text-white">
              <button onClick={() => seek(-10)} className="p-1 hover:text-white/80" title="-10s">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" /></svg>
              </button>
              <button onClick={togglePlayPause} className="p-1 hover:text-white/80">
                {isPlaying ? (
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                )}
              </button>
              <button onClick={() => seek(10)} className="p-1 hover:text-white/80" title="+10s">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" /></svg>
              </button>
              <span className="text-xs font-mono text-white/70 min-w-[80px]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <div className="flex-1" />
              {annotations.length > 0 && (
                <span className="text-xs text-white/50">
                  {bookmarksList.length} marc. / {highlights.length} anot.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voice panel (right sidebar) */}
      {ui.isPanelOpen('voice') && (
        <div className="w-80 border-l border-white/10 bg-gray-900 overflow-y-auto shrink-0">
          <VoiceCommentsPanel
            fs={fs}
            filePath={filePath}
            currentLocation={`time:${Math.floor(currentTime)}`}
            variant="panel"
            onVoiceLinked={ann.voiceLinked}
            onVoiceUnlinked={ann.voiceUnlinked}
            onAutoCreateAnnotation={handleAutoCreateAnnotation}
          />
        </div>
      )}
    </div>
  );
}
