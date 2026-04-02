/**
 * VoiceCommentsPanel - Shared voice comments UI for all readers.
 * 
 * Handles recording, playback, and listing voice comments.
 * The component is styled via the `variant` prop to match the host reader's theme.
 * 
 * Variants:
 *  - "sidebar": For EpubReader (inline styles with theme colors, sidebar layout)
 *  - "overlay": For ComicReader (dark overlay, absolute positioned)
 *  - "panel":   For PdfReader (Tailwind utility classes, sidebar layout)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { FSAdapter } from '@/services/vaultParser';
import { formatDuration } from '@/hooks/useReaderStorage';
import {
  isRecordingSupported,
  requestMicrophoneAccess,
  createRecorder,
  saveVoiceComment,
  loadVoiceComments,
  deleteVoiceComment,
  type VoiceComment,
} from '@/services/voiceRecorder';

// ---- Types ----

interface VoiceCommentsPanelProps {
  fs: FSAdapter;
  filePath: string;
  /** Current location in the document (CFI for EPUB, "page:N" for PDF/comic) */
  currentLocation: string;
  variant: 'sidebar' | 'overlay' | 'panel';
  /** For sidebar variant: inline theme colors */
  theme?: { bg: string; text: string; border: string };
  /** If set, new voice comments will be linked to this annotation */
  annotationId?: string;
  /** Called when a voice comment is linked to an annotation (after save) */
  onVoiceLinked?: (annotationId: string, voiceId: string) => void;
  /** Called when a voice comment linked to an annotation is deleted */
  onVoiceUnlinked?: (annotationId: string, voiceId: string) => void;
  /** Called when recording finishes and no annotationId was provided — reader creates a bookmark annotation with the voice linked */
  onAutoCreateAnnotation?: (voiceId: string) => void;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'saving';

// ---- Component ----

export function VoiceCommentsPanel({
  fs,
  filePath,
  currentLocation,
  variant,
  theme,
  annotationId,
  onVoiceLinked,
  onVoiceUnlinked,
  onAutoCreateAnnotation,
}: VoiceCommentsPanelProps) {
  const [comments, setComments] = useState<VoiceComment[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => isRecordingSupported());

  const recorderRef = useRef<MediaRecorder | null>(null);
  const getBlobRef = useRef<(() => Promise<Blob>) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef(0);

  // Load existing comments on mount
  useEffect(() => {
    loadVoiceComments(fs, filePath).then(setComments).catch(() => {});
  }, [fs, filePath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Revoke blob URLs
      comments.forEach((c) => {
        if (c.blobUrl) URL.revokeObjectURL(c.blobUrl);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setRecordingState('requesting');
    try {
      const stream = await requestMicrophoneAccess();
      streamRef.current = stream;
      const { recorder, getBlob } = createRecorder(stream);
      recorderRef.current = recorder;
      getBlobRef.current = getBlob;

      setRecordDuration(0);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRecordDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);

      recorder.start(100); // 100ms chunks
      setRecordingState('recording');
    } catch (err) {
      setRecordingState('idle');
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permiso de microfono denegado'
          : 'Error al iniciar la grabacion'
      );
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || !getBlobRef.current) return;

    setRecordingState('saving');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    recorderRef.current.stop();
    const blob = await getBlobRef.current();

    // Stop mic
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const duration = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));

    try {
      const saved = await saveVoiceComment(fs, filePath, blob, {
        id: `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        duration,
        location: currentLocation,
        annotationId,
        createdAt: new Date().toISOString(),
      });
      setComments((prev) => [...prev, saved]);
      // Link voice comment to annotation if applicable
      if (annotationId && onVoiceLinked) {
        onVoiceLinked(annotationId, saved.id);
      } else if (!annotationId && onAutoCreateAnnotation) {
        // Auto-create a bookmark annotation at current position with this voice linked
        onAutoCreateAnnotation(saved.id);
      }
    } catch {
      setError('Error al guardar el comentario');
    }

    recorderRef.current = null;
    getBlobRef.current = null;
    setRecordingState('idle');
    setRecordDuration(0);
  }, [fs, filePath, currentLocation, annotationId, onVoiceLinked]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        // Find comment before deleting (to check annotationId)
        const comment = comments.find((c) => c.id === commentId);
        await deleteVoiceComment(fs, filePath, commentId);
        setComments((prev) => {
          const c = prev.find((x) => x.id === commentId);
          if (c?.blobUrl) URL.revokeObjectURL(c.blobUrl);
          return prev.filter((x) => x.id !== commentId);
        });
        if (playingId === commentId) {
          audioRef.current?.pause();
          setPlayingId(null);
        }
        // Unlink voice comment from annotation if applicable
        if (comment?.annotationId && onVoiceUnlinked) {
          onVoiceUnlinked(comment.annotationId, commentId);
        }
      } catch {
        setError('Error al eliminar el comentario');
      }
    },
    [fs, filePath, playingId, comments, onVoiceUnlinked]
  );

  const playComment = useCallback(
    async (comment: VoiceComment) => {
      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        if (playingId === comment.id) {
          setPlayingId(null);
          return; // Toggle off
        }
      }

      let url = comment.blobUrl;
      if (!url) {
        // Load audio from vault (b64 file)
        try {
          const b64 = await fs.readFile(comment.filePath + '.b64');
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const ext = comment.filePath.includes('.webm') ? 'audio/webm' : 'audio/ogg';
          const blob = new Blob([bytes], { type: ext });
          url = URL.createObjectURL(blob);
          // Cache the blob URL
          setComments((prev) =>
            prev.map((c) => (c.id === comment.id ? { ...c, blobUrl: url } : c))
          );
        } catch {
          setError('Error al cargar el audio');
          return;
        }
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(comment.id);
      audio.onended = () => {
        setPlayingId(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingId(null);
        audioRef.current = null;
      };
      audio.play().catch(() => {
        setPlayingId(null);
        audioRef.current = null;
      });
    },
    [fs, playingId]
  );

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) +
        ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  // ---- Styles based on variant ----
  const isOverlay = variant === 'overlay';
  const isSidebar = variant === 'sidebar';

  const containerClass = isOverlay
    ? 'space-y-3'
    : isSidebar
      ? 'p-4 space-y-3'
      : 'p-4 space-y-3';

  const headerStyle = isSidebar
    ? { color: theme?.text }
    : undefined;

  const mutedStyle = isSidebar
    ? { color: theme?.text, opacity: 0.4 }
    : undefined;

  const borderStyle = isSidebar
    ? { borderColor: theme?.border || '#eee' }
    : undefined;

  return (
    <div className={containerClass}>
      <h3
        className={`text-sm font-semibold ${isOverlay ? 'text-white' : isSidebar ? '' : 'text-text'}`}
        style={headerStyle}
      >
        Comentarios de voz ({comments.length})
      </h3>

      {/* Recording controls */}
      {supported ? (
        <div className="space-y-2">
          {recordingState === 'idle' && (
            <button
              onClick={startRecording}
              className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                isOverlay
                  ? 'bg-white/10 text-white/80 hover:bg-white/15'
                  : isSidebar
                    ? 'hover:opacity-80'
                    : 'bg-surface-hover text-text hover:bg-surface-alt'
              }`}
              style={isSidebar ? { background: theme?.border, color: theme?.text } : undefined}
            >
              <MicIcon variant={variant} />
              Grabar comentario
            </button>
          )}

          {recordingState === 'requesting' && (
            <div
              className={`flex items-center gap-2 py-2 px-3 rounded-lg text-sm ${
                isOverlay ? 'bg-white/10 text-white/60' : isSidebar ? '' : 'bg-surface-hover text-text-muted'
              }`}
              style={isSidebar ? { background: theme?.border, color: theme?.text, opacity: 0.6 } : undefined}
            >
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Solicitando microfono...
            </div>
          )}

          {recordingState === 'recording' && (
            <button
              onClick={stopRecording}
              className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                isOverlay
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/20 dark:text-red-400'
              }`}
            >
              <RecordingDot />
              <span className="flex-1 text-left">Grabando... {formatDuration(recordDuration)}</span>
              <span className="text-xs opacity-60">Clic para detener</span>
            </button>
          )}

          {recordingState === 'saving' && (
            <div
              className={`flex items-center gap-2 py-2 px-3 rounded-lg text-sm ${
                isOverlay ? 'bg-white/10 text-white/60' : isSidebar ? '' : 'bg-surface-hover text-text-muted'
              }`}
              style={isSidebar ? { background: theme?.border, color: theme?.text, opacity: 0.6 } : undefined}
            >
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Guardando...
            </div>
          )}
        </div>
      ) : (
        <p
          className={`text-xs ${isOverlay ? 'text-white/40' : isSidebar ? '' : 'text-text-muted'}`}
          style={mutedStyle}
        >
          La grabacion de audio no esta disponible en este navegador
        </p>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Comments list */}
      {comments.length === 0 && recordingState === 'idle' && (
        <p
          className={`text-xs ${isOverlay ? 'text-white/40' : isSidebar ? '' : 'text-text-muted'}`}
          style={mutedStyle}
        >
          Sin comentarios de voz
        </p>
      )}

      <div className="space-y-1">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`flex items-center gap-2 py-2 px-2 rounded-lg group ${
              isOverlay
                ? 'hover:bg-white/5'
                : isSidebar
                  ? 'border-b'
                  : 'hover:bg-surface-hover border-b border-border'
            }`}
            style={isSidebar ? borderStyle : undefined}
          >
            {/* Play button */}
            <button
              onClick={() => playComment(comment)}
              className={`p-1.5 rounded-full shrink-0 transition-colors ${
                playingId === comment.id
                  ? 'bg-primary text-white'
                  : isOverlay
                    ? 'bg-white/10 text-white/70 hover:bg-white/15'
                    : isSidebar
                      ? 'hover:opacity-70'
                      : 'bg-surface-alt text-text-secondary hover:bg-surface-hover'
              }`}
              style={
                isSidebar && playingId !== comment.id
                  ? { background: theme?.border, color: theme?.text }
                  : undefined
              }
              title={playingId === comment.id ? 'Detener' : 'Reproducir'}
            >
              {playingId === comment.id ? <StopSmallIcon variant={variant} /> : <PlayIcon variant={variant} />}
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-xs font-medium ${isOverlay ? 'text-white/80' : isSidebar ? '' : 'text-text'}`}
                  style={isSidebar ? { color: theme?.text } : undefined}
                >
                  {formatDuration(comment.duration)}
                </span>
                <span
                  className={`text-[10px] ${isOverlay ? 'text-white/30' : isSidebar ? '' : 'text-text-muted'}`}
                  style={isSidebar ? { color: theme?.text, opacity: 0.35 } : undefined}
                >
                  {comment.location}
                </span>
              </div>
              <p
                className={`text-[10px] ${isOverlay ? 'text-white/30' : isSidebar ? '' : 'text-text-muted'}`}
                style={isSidebar ? { color: theme?.text, opacity: 0.35 } : undefined}
              >
                {formatTime(comment.createdAt)}
              </p>
              {comment.selectedText && (
                <p
                  className={`text-[10px] truncate mt-0.5 ${isOverlay ? 'text-white/40' : isSidebar ? '' : 'text-text-muted'}`}
                  style={isSidebar ? { color: theme?.text, opacity: 0.45 } : undefined}
                >
                  "{comment.selectedText}"
                </p>
              )}
            </div>

            {/* Delete button */}
            <button
              onClick={() => handleDelete(comment.id)}
              className={`p-1 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                isOverlay
                  ? 'text-white/40 hover:text-red-400'
                  : isSidebar
                    ? 'hover:opacity-70'
                    : 'text-text-muted hover:text-danger'
              }`}
              style={isSidebar ? { color: theme?.text, opacity: 0.3 } : undefined}
              title="Eliminar"
            >
              <TrashSmallIcon variant={variant} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Icons ----

function MicIcon({ variant }: { variant: string }) {
  const cls = variant === 'overlay' ? 'w-4 h-4 text-white/70' : 'w-4 h-4';
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

export function MicButtonIcon({ color, size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function RecordingDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
    </span>
  );
}

function PlayIcon({ variant }: { variant: string }) {
  const cls = variant === 'overlay' ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5';
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function StopSmallIcon({ variant }: { variant: string }) {
  const cls = variant === 'overlay' ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5';
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function TrashSmallIcon({ variant }: { variant: string }) {
  const size = variant === 'overlay' ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5';
  return (
    <svg className={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
