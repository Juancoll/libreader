/**
 * AIChatPanel — Floating AI chat panel with voice input and save-to-note.
 *
 * Features:
 * - Message history with user/assistant bubbles
 * - Text input + send button
 * - Voice input via SpeechRecognition (es-ES)
 * - "Guardar como nota" button on assistant messages
 * - Context indicator (shows current book/selection)
 * - Responsive: bottom sheet on mobile, side panel on desktop
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { useAIChat } from '@/hooks/useAIChat';
import type { ChatMessage } from '@/hooks/useAIChat';
import type { Annotation } from '@/types/annotation';
import { loadAnnotations, saveAnnotations } from '@/services/annotationService';

// ---- Icons (inline SVGs to avoid new files) ----

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ---- Speech Recognition ----

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
  resultIndex: number;
}

function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<unknown>(null);

  const toggle = useCallback(() => {
    if (isListening) {
      (recognitionRef.current as { stop: () => void })?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript;
      if (text) onResult(text);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onResult]);

  const isSupported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return { isListening, toggle, isSupported };
}

// ---- Message Bubble ----

function MessageBubble({
  msg,
  onSaveAsNote,
}: {
  msg: ChatMessage;
  onSaveAsNote?: (content: string) => void;
}) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--color-primary)] text-white rounded-br-md'
            : 'bg-[var(--color-surface-alt)] text-[var(--color-text)] rounded-bl-md'
        }`}
      >
        {msg.contextSnippet && (
          <div className="text-xs opacity-70 mb-1.5 italic border-l-2 border-current pl-2">
            &quot;{msg.contextSnippet.slice(0, 100)}{msg.contextSnippet.length > 100 ? '...' : ''}&quot;
          </div>
        )}
        <div className="whitespace-pre-wrap">{msg.content}</div>
        {!isUser && onSaveAsNote && (
          <button
            onClick={() => onSaveAsNote(msg.content)}
            className="mt-2 flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 transition-opacity"
            title="Guardar como nota"
          >
            <SaveIcon /> Guardar como nota
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Context Badge ----

function ContextBadge() {
  const ctx = useLibraryStore((s) => s.chatContext);

  if (!ctx.bookTitle && !ctx.selectedText) return null;

  return (
    <div className="px-3 py-1.5 bg-[var(--color-surface-alt)] text-xs text-[var(--color-text-secondary)] flex items-center gap-2 border-b border-[var(--color-border)]">
      {ctx.bookTitle && (
        <span className="truncate max-w-[200px]" title={ctx.bookTitle}>
          {ctx.bookTitle}
        </span>
      )}
      {ctx.selectedText && (
        <span className="truncate max-w-[200px] italic opacity-70" title={ctx.selectedText}>
          &quot;{ctx.selectedText.slice(0, 60)}...&quot;
        </span>
      )}
    </div>
  );
}

// ---- Main Panel ----

export function AIChatPanel() {
  const chatOpen = useLibraryStore((s) => s.chatOpen);
  const setChatOpen = useLibraryStore((s) => s.setChatOpen);
  const chatContext = useLibraryStore((s) => s.chatContext);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load annotations for current book context
  const annotations = chatContext.filePath
    ? loadAnnotations(chatContext.filePath)
    : [];

  const { messages, isLoading, error, sendMessage, sendWithContext, clearMessages } = useAIChat(annotations);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chatOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');

    if (chatContext.selectedText) {
      sendWithContext(text, chatContext.selectedText);
    } else {
      sendMessage(text);
    }
  }, [input, isLoading, chatContext.selectedText, sendMessage, sendWithContext]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleVoiceResult = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + ' ' + text : text));
  }, []);

  const { isListening, toggle: toggleVoice, isSupported: voiceSupported } = useSpeechRecognition(handleVoiceResult);

  const handleSaveAsNote = useCallback((content: string) => {
    if (!chatContext.filePath) {
      // No book context — copy to clipboard as fallback
      navigator.clipboard?.writeText(content);
      return;
    }

    // Create an annotation with the AI response as a note
    const current = loadAnnotations(chatContext.filePath);
    const newAnnotation: Annotation = {
      id: `ai-note-${Date.now()}`,
      position: {},
      style: { color: 'blue' },
      note: `[IA] ${content}`,
      voiceIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveAnnotations(chatContext.filePath, [...current, newAnnotation]);
  }, [chatContext.filePath]);

  if (!chatOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center sm:justify-end pointer-events-none">
      {/* Backdrop on mobile */}
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto sm:hidden"
        onClick={() => setChatOpen(false)}
      />

      {/* Panel */}
      <div className="pointer-events-auto relative w-full sm:w-[400px] sm:max-w-[90vw] h-[80vh] sm:h-[70vh] sm:max-h-[700px] sm:mr-4 sm:mb-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <ChatIcon />
            <span className="font-semibold text-sm text-[var(--color-text)]">Asistente IA</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] transition-colors"
                title="Limpiar conversacion"
              >
                <TrashIcon />
              </button>
            )}
            <button
              onClick={() => setChatOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Context badge */}
        <ContextBadge />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center text-[var(--color-text-secondary)] text-sm">
              <ChatIcon />
              <p className="mt-3 font-medium">Asistente de lectura</p>
              <p className="mt-1 text-xs max-w-[250px]">
                {chatContext.bookTitle
                  ? `Pregunta sobre "${chatContext.bookTitle}", tus notas, o pide documentacion.`
                  : 'Abre un libro para preguntar sobre su contenido, notas y anotaciones.'}
              </p>
              {chatContext.selectedText && (
                <p className="mt-2 text-xs italic opacity-70 max-w-[250px]">
                  Texto seleccionado: &quot;{chatContext.selectedText.slice(0, 80)}...&quot;
                </p>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onSaveAsNote={msg.role === 'assistant' ? handleSaveAsNote : undefined}
            />
          ))}

          {isLoading && (
            <div className="flex justify-start mb-3">
              <div className="bg-[var(--color-surface-alt)] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-[var(--color-text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[var(--color-text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[var(--color-text-secondary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-[var(--color-border)] px-3 py-2 bg-[var(--color-surface)]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={chatContext.selectedText ? 'Pregunta sobre la seleccion...' : 'Escribe tu pregunta...'}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 max-h-[120px]"
              style={{ minHeight: '40px' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />

            {voiceSupported && (
              <button
                onClick={toggleVoice}
                className={`p-2.5 rounded-xl transition-colors ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
                title={isListening ? 'Detener' : 'Hablar'}
              >
                <MicIcon active={isListening} />
              </button>
            )}

            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-[var(--color-primary)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              title="Enviar"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Floating Chat Button ----

export function AIChatButton() {
  const chatOpen = useLibraryStore((s) => s.chatOpen);
  const setChatOpen = useLibraryStore((s) => s.setChatOpen);
  const aiProvider = useLibraryStore((s) => s.aiProvider);

  // Don't show if AI is not configured
  if (!aiProvider) return null;

  // Don't show button when panel is open
  if (chatOpen) return null;

  return (
    <button
      onClick={() => setChatOpen(true)}
      className="fixed bottom-6 right-6 z-[9997] w-14 h-14 rounded-full bg-[var(--color-primary)] text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
      title="Asistente IA"
    >
      <ChatIcon />
    </button>
  );
}
