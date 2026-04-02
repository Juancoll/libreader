/**
 * AnnotationsPanel — shared sidebar showing bookmarks and highlights.
 *
 * Works with the unified Annotation type. Used by EpubReader, PdfReader,
 * ComicReader, and future readers.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Annotation } from '@/types/annotation';
import { HIGHLIGHT_COLORS, isBookmark } from '@/types/annotation';
import { formatDuration } from '@/hooks/useReaderStorage';
import type { FSAdapter } from '@/services/vaultParser';
import {
  isRecordingSupported,
  requestMicrophoneAccess,
  createRecorder,
  saveVoiceComment,
  loadVoiceComments,
  deleteVoiceComment,
  type VoiceComment,
} from '@/services/voiceRecorder';

export interface AnnotationsPanelProps {
  annotations: Annotation[];
  /** Called when user taps a bookmark or highlight to navigate to it */
  onNavigate: (annotation: Annotation) => void;
  /** Called when user deletes an annotation */
  onDelete: (annotationId: string) => void;
  /** Called when user edits a note */
  onEditNote?: (annotationId: string, note: string) => void;
  /** Optional theme overrides (for EPUB's custom theming) */
  theme?: { bg?: string; text?: string; border?: string; muted?: string };
  /** How to display a bookmark's location (reader-specific) */
  formatBookmarkLocation: (annotation: Annotation) => { title: string; detail?: string };
  /** How to display a highlight's location (reader-specific) */
  formatHighlightLocation?: (annotation: Annotation) => string;
  /** Currently selected annotation (highlighted in panel + on page) */
  selectedAnnotationId?: string | null;
  /** Called when user wants to record/manage voice for an annotation */
  onVoiceClick?: (annotationId: string) => void;
  /** FS adapter for voice recording (when provided, inline recording is enabled) */
  fs?: FSAdapter;
  /** Item file path for voice recording */
  filePath?: string;
  /** Current location string for voice comments */
  currentLocation?: string;
  /** Called when a voice comment is linked to an annotation */
  onVoiceLinked?: (annotationId: string, voiceId: string) => void;
  /** Called when a voice comment is unlinked from an annotation */
  onVoiceUnlinked?: (annotationId: string, voiceId: string) => void;
}

export function AnnotationsPanel({
  annotations,
  onNavigate,
  onDelete,
  onEditNote,
  theme,
  formatBookmarkLocation,
  formatHighlightLocation,
  selectedAnnotationId,
  onVoiceClick,
  fs,
  filePath,
  currentLocation,
  onVoiceLinked,
  onVoiceUnlinked,
}: AnnotationsPanelProps) {
  const bookmarks = annotations.filter(isBookmark);
  const highlights = annotations.filter((a) => !isBookmark(a));
  const selectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected annotation
  useEffect(() => {
    if (selectedAnnotationId && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedAnnotationId]);

  // Sort bookmarks by position
  const sortedBookmarks = [...bookmarks].sort((a, b) => {
    // By timeStart first (video), then page index, then fraction
    if (a.position.timeStart != null && b.position.timeStart != null) return a.position.timeStart - b.position.timeStart;
    if (a.position.index != null && b.position.index != null) return a.position.index - b.position.index;
    if (a.position.fraction != null && b.position.fraction != null) return a.position.fraction - b.position.fraction;
    return 0;
  });

  // Sort highlights by position
  const sortedHighlights = [...highlights].sort((a, b) => {
    // By timeStart first (video), then page index, then fraction
    if (a.position.timeStart != null && b.position.timeStart != null) return a.position.timeStart - b.position.timeStart;
    if (a.position.index != null && b.position.index != null) {
      if (a.position.index !== b.position.index) return a.position.index - b.position.index;
      // Same page: sort by text layer position or region Y
      const aStart = a.textSelection?.startItemIdx ?? a.region?.y ?? 0;
      const bStart = b.textSelection?.startItemIdx ?? b.region?.y ?? 0;
      return aStart - bStart;
    }
    if (a.position.fraction != null && b.position.fraction != null) return a.position.fraction - b.position.fraction;
    return 0;
  });

  const textStyle = theme?.text ? { color: theme.text } : {};
  const mutedStyle = theme?.muted
    ? { color: theme.muted }
    : theme?.text
      ? { color: theme.text, opacity: 0.4 }
      : {};
  const borderStyle = theme?.border ? { borderColor: theme.border } : {};

  return (
    <aside
      className="w-80 border-r overflow-y-auto shrink-0 bg-surface border-border"
      style={{
        ...(theme?.bg ? { background: theme.bg } : {}),
        ...borderStyle,
      }}
    >
      <div className="p-4 space-y-4">
        {/* Bookmarks */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-2" style={textStyle}>
            Marcadores ({sortedBookmarks.length})
          </h3>
          {sortedBookmarks.length === 0 && (
            <p className="text-xs text-text-muted" style={mutedStyle}>Sin marcadores</p>
          )}
          {sortedBookmarks.map((bm) => {
            const loc = formatBookmarkLocation(bm);
            const isSelected = selectedAnnotationId === bm.id;
            return (
              <div
                key={bm.id}
                ref={isSelected ? selectedRef : undefined}
                className={`py-2 border-b border-border rounded-md transition-colors ${isSelected ? 'ring-1 ring-primary/60 bg-primary/10' : ''}`}
                style={borderStyle}
              >
                <div className="flex items-center gap-2">
                  <button onClick={() => onNavigate(bm)} className="flex-1 text-left min-w-0">
                    <p className="text-xs font-medium truncate text-text" style={textStyle}>
                      {loc.title}
                    </p>
                    {loc.detail && (
                      <p className="text-[10px] text-text-muted" style={mutedStyle}>{loc.detail}</p>
                    )}
                  </button>
                  {onVoiceClick && (
                    <button
                      onClick={() => onVoiceClick(bm.id)}
                      className="p-1 hover:opacity-70 shrink-0"
                      title={bm.voiceIds.length > 0 ? `${bm.voiceIds.length} audio(s)` : 'Agregar audio'}
                    >
                      <MicIcon color={theme?.text} active={bm.voiceIds.length > 0} />
                    </button>
                  )}
                  {onEditNote && (
                    <NoteToggleButton
                      hasNote={!!bm.note}
                      annotationId={bm.id}
                      color={theme?.text}
                    />
                  )}
                  <button onClick={() => onDelete(bm.id)} className="p-1 hover:opacity-70 shrink-0">
                    <TrashIcon color={theme?.text} />
                  </button>
                </div>
                {onEditNote && (
                  <InlineNoteEditor
                    annotationId={bm.id}
                    note={bm.note}
                    voiceIds={bm.voiceIds}
                    onSave={onEditNote}
                    theme={theme}
                    fs={fs}
                    filePath={filePath}
                    currentLocation={currentLocation}
                    onVoiceLinked={onVoiceLinked}
                    onVoiceUnlinked={onVoiceUnlinked}
                  />
                )}
                {!onEditNote && bm.note && (
                  <p className="text-[10px] mt-1 ml-0 text-text-muted" style={mutedStyle}>{bm.note}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Highlights */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-2" style={textStyle}>
            Resaltados ({sortedHighlights.length})
          </h3>
          {sortedHighlights.length === 0 && (
            <p className="text-xs text-text-muted" style={mutedStyle}>Sin resaltados</p>
          )}
          {sortedHighlights.map((hl) => {
            const isSelected = selectedAnnotationId === hl.id;
            return (
            <div
              key={hl.id}
              ref={isSelected ? selectedRef : undefined}
              className={`py-2 border-b border-border rounded-md transition-colors ${isSelected ? 'ring-1 ring-primary/60 bg-primary/10' : ''}`}
              style={borderStyle}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0 mt-1"
                  style={{ background: HIGHLIGHT_COLORS[hl.style.color].fill }}
                />
                <button onClick={() => onNavigate(hl)} className="flex-1 text-left min-w-0">
                  <p className="text-xs line-clamp-3 text-text" style={textStyle}>
                    {hl.textSelection?.text
                      ? <>&ldquo;{hl.textSelection.text}&rdquo;</>
                      : hl.region
                        ? `Region en pagina ${hl.position.index ?? '?'}`
                        : '(Sin texto)'}
                  </p>
                  {formatHighlightLocation && (
                    <p className="text-[10px] text-text-muted mt-0.5" style={mutedStyle}>
                      {formatHighlightLocation(hl)}
                    </p>
                  )}
                </button>
                {onVoiceClick && (
                  <button
                    onClick={() => onVoiceClick(hl.id)}
                    className="p-1 hover:opacity-70 shrink-0"
                    title={hl.voiceIds.length > 0 ? `${hl.voiceIds.length} audio(s)` : 'Agregar audio'}
                  >
                    <MicIcon color={theme?.text} active={hl.voiceIds.length > 0} />
                  </button>
                )}
                {onEditNote && (
                  <NoteToggleButton
                    hasNote={!!hl.note}
                    annotationId={hl.id}
                    color={theme?.text}
                  />
                )}
                <button onClick={() => onDelete(hl.id)} className="p-1 hover:opacity-70 shrink-0">
                  <TrashIcon color={theme?.text} />
                </button>
              </div>
              {onEditNote && (
                <InlineNoteEditor
                  annotationId={hl.id}
                  note={hl.note}
                  voiceIds={hl.voiceIds}
                  onSave={onEditNote}
                  theme={theme}
                  fs={fs}
                  filePath={filePath}
                  currentLocation={currentLocation}
                  onVoiceLinked={onVoiceLinked}
                  onVoiceUnlinked={onVoiceUnlinked}
                />
              )}
              {!onEditNote && hl.note && (
                <p className="text-[10px] mt-1 ml-5 text-text-muted" style={mutedStyle}>{hl.note}</p>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ---- Inline note editor with 3 input modes: write, dictate, record audio ----

interface InlineNoteEditorProps {
  annotationId: string;
  note: string;
  voiceIds: string[];
  onSave: (annotationId: string, note: string) => void;
  theme?: { bg?: string; text?: string; border?: string; muted?: string };
  fs?: FSAdapter;
  filePath?: string;
  currentLocation?: string;
  onVoiceLinked?: (annotationId: string, voiceId: string) => void;
  onVoiceUnlinked?: (annotationId: string, voiceId: string) => void;
}

function InlineNoteEditor({
  annotationId,
  note,
  voiceIds,
  onSave,
  theme,
  fs,
  filePath,
  currentLocation,
  onVoiceLinked,
  onVoiceUnlinked,
}: InlineNoteEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Speech-to-text state
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Audio recording state
  type RecState = 'idle' | 'requesting' | 'recording' | 'saving';
  const [recState, setRecState] = useState<RecState>('idle');
  const [recDuration, setRecDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const getBlobRef = useRef<(() => Promise<Blob>) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef(0);

  // Inline voice comments (loaded from vault)
  const [voiceComments, setVoiceComments] = useState<VoiceComment[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voice comments for this annotation
  useEffect(() => {
    if (!fs || !filePath || voiceIds.length === 0) {
      setVoiceComments([]);
      return;
    }
    loadVoiceComments(fs, filePath).then((all) => {
      setVoiceComments(all.filter((c) => c.annotationId === annotationId));
    }).catch(() => {});
  }, [fs, filePath, annotationId, voiceIds.length]);

  // Sync draft when note changes externally
  useEffect(() => { setDraft(note); }, [note]);

  // Auto-focus when editing starts
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing, draft.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed !== note) {
      onSave(annotationId, trimmed);
    }
    setEditing(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [draft, note, onSave, annotationId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDraft(note);
      setEditing(false);
      if (recognitionRef.current) { recognitionRef.current.abort(); setIsListening(false); }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  }, [note, save]);

  // ---- Speech-to-text (dictation) ----
  const toggleSpeechToText = useCallback(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t;
        else interim += t;
      }
      setDraft((prev) => {
        const base = finalTranscript
          ? (prev.endsWith(' ') || prev.length === 0 ? prev : prev + ' ') + finalTranscript
          : prev;
        finalTranscript = '';
        return interim ? base + interim : base;
      });
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') console.warn('Speech recognition error:', event.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
    setIsListening(true);
    if (!editing) setEditing(true);
  }, [isListening, editing]);

  // ---- Audio recording ----
  const canRecord = !!fs && !!filePath && isRecordingSupported();

  const startRecording = useCallback(async () => {
    if (!fs || !filePath) return;
    setRecState('requesting');
    try {
      const stream = await requestMicrophoneAccess();
      streamRef.current = stream;
      const { recorder, getBlob } = createRecorder(stream);
      recorderRef.current = recorder;
      getBlobRef.current = getBlob;

      setRecDuration(0);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRecDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);

      recorder.start(100);
      setRecState('recording');
    } catch (err) {
      setRecState('idle');
      console.warn('Mic error:', err);
    }
  }, [fs, filePath]);

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || !getBlobRef.current || !fs || !filePath) return;
    setRecState('saving');
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }

    recorderRef.current.stop();
    const blob = await getBlobRef.current();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const duration = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));
    try {
      const saved = await saveVoiceComment(fs, filePath, blob, {
        id: `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        duration,
        location: currentLocation || '',
        annotationId,
        createdAt: new Date().toISOString(),
      });
      setVoiceComments((prev) => [...prev, saved]);
      if (onVoiceLinked) onVoiceLinked(annotationId, saved.id);
    } catch {
      console.warn('Error saving voice comment');
    }

    recorderRef.current = null;
    getBlobRef.current = null;
    setRecState('idle');
    setRecDuration(0);
  }, [fs, filePath, currentLocation, annotationId, onVoiceLinked]);

  const handleDeleteVoice = useCallback(async (commentId: string) => {
    if (!fs || !filePath) return;
    try {
      await deleteVoiceComment(fs, filePath, commentId);
      setVoiceComments((prev) => {
        const c = prev.find((x) => x.id === commentId);
        if (c?.blobUrl) URL.revokeObjectURL(c.blobUrl);
        return prev.filter((x) => x.id !== commentId);
      });
      if (playingId === commentId) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
      if (onVoiceUnlinked) onVoiceUnlinked(annotationId, commentId);
    } catch {
      console.warn('Error deleting voice comment');
    }
  }, [fs, filePath, playingId, annotationId, onVoiceUnlinked]);

  const playVoice = useCallback(async (comment: VoiceComment) => {
    if (playingId === comment.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Get blob URL
    let url = comment.blobUrl;
    if (!url && fs && filePath) {
      try {
        const b64 = await fs.readFile(comment.filePath + '.b64');
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const mimeType = comment.filePath.includes('.webm') ? 'audio/webm' : 'audio/ogg';
        const blob = new Blob([bytes], { type: mimeType });
        url = URL.createObjectURL(blob);
        // Cache it
        setVoiceComments((prev) =>
          prev.map((c) => c.id === comment.id ? { ...c, blobUrl: url } : c)
        );
      } catch { return; }
    }
    if (!url) return;

    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(comment.id);
  }, [playingId, fs, filePath]);

  const mutedStyle = theme?.muted
    ? { color: theme.muted }
    : theme?.text
      ? { color: theme.text, opacity: 0.5 }
      : {};

  const inputBg = theme?.bg
    ? `color-mix(in srgb, ${theme.bg} 50%, ${theme.text || '#fff'} 8%)`
    : undefined;

  const hasSpeechSupport = typeof window !== 'undefined' &&
    (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

  const hasAnyVoice = voiceComments.length > 0;

  // ---- Collapsed state: no note, not editing ----
  if (!editing && !note && !hasAnyVoice) {
    return (
      <div className="flex items-center gap-1.5 mt-1 ml-5">
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] hover:opacity-80 text-text-muted"
          style={mutedStyle}
        >
          + Agregar nota...
        </button>
      </div>
    );
  }

  // ---- Note display (not editing) ----
  if (!editing && !hasAnyVoice) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[10px] mt-1 ml-5 text-left hover:opacity-80 text-text-muted"
        style={mutedStyle}
      >
        {note}
      </button>
    );
  }

  // ---- Expanded: show note + voice comments + toolbar ----
  return (
    <div className="mt-1 ml-5 space-y-1">
      {/* Text note */}
      {editing ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (!isListening) save(); }}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Escribe una nota..."
            className="w-full text-[11px] p-1.5 pr-7 rounded border resize-none focus:outline-none focus:ring-1"
            style={{
              background: inputBg || 'var(--color-surface, #fff)',
              color: theme?.text || 'inherit',
              borderColor: isListening ? '#ef4444' : (theme?.border || 'var(--color-border, #e0e0e0)'),
              ...(theme?.text ? { caretColor: theme.text } : {}),
            }}
          />
        </div>
      ) : note ? (
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-left hover:opacity-80 text-text-muted"
          style={mutedStyle}
        >
          {note}
        </button>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] hover:opacity-80 text-text-muted"
          style={mutedStyle}
        >
          + Agregar nota...
        </button>
      )}

      {/* Voice comments list */}
      {voiceComments.map((vc) => (
        <div
          key={vc.id}
          className="flex items-center gap-1.5 py-0.5 rounded"
        >
          <button
            onClick={() => playVoice(vc)}
            className="flex items-center gap-1 text-[10px] hover:opacity-80"
            style={{ color: theme?.text || 'inherit', opacity: 0.7 }}
            title={playingId === vc.id ? 'Pausar' : 'Reproducir'}
          >
            {playingId === vc.id ? <StopSmIcon color={theme?.text} /> : <PlaySmIcon color={theme?.text} />}
            <span>{formatDuration(vc.duration)}</span>
          </button>
          <button
            onClick={() => handleDeleteVoice(vc.id)}
            className="p-0.5 hover:opacity-70 shrink-0"
            title="Eliminar audio"
          >
            <TrashSmIcon color={theme?.text} />
          </button>
        </div>
      ))}

      {/* Recording in progress */}
      {recState === 'recording' && (
        <div className="flex items-center gap-2 py-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-mono" style={{ color: '#ef4444' }}>
            {formatDuration(recDuration)}
          </span>
          <button
            onClick={stopRecording}
            className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Detener
          </button>
        </div>
      )}
      {recState === 'saving' && (
        <p className="text-[10px]" style={mutedStyle}>Guardando audio...</p>
      )}
      {recState === 'requesting' && (
        <p className="text-[10px]" style={mutedStyle}>Accediendo al microfono...</p>
      )}

      {/* Action toolbar: write / dictate / record */}
      {recState === 'idle' && (
        <div className="flex items-center gap-0.5 pt-0.5">
          {/* Write button (only if not already editing) */}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:opacity-70"
              title="Escribir nota"
            >
              <WriteIcon color={theme?.text} />
            </button>
          )}
          {/* Dictate (speech-to-text) */}
          {hasSpeechSupport && (
            <button
              onClick={toggleSpeechToText}
              className={`p-1 rounded transition-colors ${isListening ? 'animate-pulse' : 'hover:opacity-70'}`}
              title={isListening ? 'Detener dictado' : 'Dictar con voz'}
            >
              <DictateIcon color={isListening ? '#ef4444' : theme?.text} active={isListening} />
            </button>
          )}
          {/* Record audio */}
          {canRecord && (
            <button
              onClick={startRecording}
              className="p-1 rounded hover:opacity-70"
              title="Grabar audio"
            >
              <RecordIcon color={theme?.text} />
            </button>
          )}
          {/* Hint text */}
          {editing && (
            <span className="text-[9px] ml-1 text-text-muted" style={mutedStyle}>
              Enter guardar · Esc cancelar
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Note toggle button (pencil icon) ----

function NoteToggleButton({
  hasNote,
  annotationId: _annotationId,
  color,
}: {
  hasNote: boolean;
  annotationId: string;
  color?: string;
}) {
  // This is a visual indicator only — clicking the note text or "+ Agregar nota" opens the editor
  return (
    <span
      className="shrink-0 mt-0.5"
      style={{ opacity: hasNote ? 0.7 : 0.3 }}
      title={hasNote ? 'Tiene nota' : 'Sin nota'}
    >
      <NoteIcon color={color} />
    </span>
  );
}

// ---- Internal icons ----

function TrashIcon({ color }: { color?: string }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.5"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function NoteIcon({ color }: { color?: string }) {
  return (
    <svg
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function MicIcon({ color, active }: { color?: string; active?: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={active ? 0.9 : 0.4}
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

// ---- Toolbar icons for InlineNoteEditor ----

/** Pencil / write icon */
function WriteIcon({ color }: { color?: string }) {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

/** Speech-to-text / dictation icon (speech bubble with waves) */
function DictateIcon({ color, active }: { color?: string; active?: boolean }) {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={active ? 1 : 0.5}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {active && <>
        <line x1="5" y1="3" x2="3" y2="3" opacity="0.6" />
        <line x1="5" y1="7" x2="1" y2="7" opacity="0.6" />
        <line x1="5" y1="11" x2="3" y2="11" opacity="0.6" />
      </>}
    </svg>
  );
}

/** Record audio icon (filled circle) */
function RecordIcon({ color }: { color?: string }) {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill={color || 'currentColor'} stroke="none" />
    </svg>
  );
}

/** Small play triangle */
function PlaySmIcon({ color }: { color?: string }) {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill={color || 'currentColor'} stroke="none">
      <polygon points="6,3 20,12 6,21" />
    </svg>
  );
}

/** Small stop square */
function StopSmIcon({ color }: { color?: string }) {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill={color || 'currentColor'} stroke="none">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

/** Small trash icon */
function TrashSmIcon({ color }: { color?: string }) {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

