/**
 * useAIChat — hook for AI Chat conversations with contextual awareness.
 *
 * Manages message history, sends messages via aiService, builds system prompts
 * from the current book context and annotations.
 */

import { useState, useCallback, useRef } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import type { AIChatContext } from '@/store/libraryStore';
import type { Annotation } from '@/types/annotation';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** If the message was generated from selected text context */
  contextSnippet?: string;
}

export interface UseAIChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  /** Send with explicit context override (e.g., selected text) */
  sendWithContext: (text: string, extraContext: string) => Promise<void>;
}

function buildSystemPrompt(ctx: AIChatContext, annotations: Annotation[]): string {
  const parts: string[] = [
    'Eres un asistente de lectura inteligente integrado en LibReader, una app de lectura de libros.',
    'Respondes siempre en espanol, de forma concisa y util.',
  ];

  if (ctx.bookTitle) {
    parts.push(`\nEl usuario esta leyendo: "${ctx.bookTitle}"`);
    if (ctx.bookAuthors?.length) {
      parts.push(`Autores: ${ctx.bookAuthors.join(', ')}`);
    }
    if (ctx.format) {
      parts.push(`Formato: ${ctx.format}`);
    }
    if (ctx.bookTags?.length) {
      parts.push(`Tags: ${ctx.bookTags.join(', ')}`);
    }
    if (ctx.bookSummary) {
      parts.push(`Resumen: ${ctx.bookSummary}`);
    }
    if (ctx.chapter) {
      parts.push(`Capitulo actual: ${ctx.chapter}`);
    }
  }

  // Include annotations as context
  const highlights = annotations.filter((a) => a.textSelection?.text);
  if (highlights.length > 0) {
    const excerpts = highlights
      .slice(0, 20) // Limit to avoid token overflow
      .map((a) => {
        let line = `- "${a.textSelection!.text.slice(0, 200)}"`;
        if (a.note) line += ` (nota: ${a.note})`;
        if (a.chapter) line += ` [${a.chapter}]`;
        return line;
      });
    parts.push(`\nAnotaciones/subrayados del usuario en este libro:\n${excerpts.join('\n')}`);
  }

  const bookmarksWithNotes = annotations.filter((a) => !a.textSelection && !a.region && a.note);
  if (bookmarksWithNotes.length > 0) {
    const notes = bookmarksWithNotes.slice(0, 10).map((a) => `- ${a.note}`);
    parts.push(`\nNotas en marcadores:\n${notes.join('\n')}`);
  }

  if (ctx.selectedText) {
    parts.push(`\nTexto actualmente seleccionado por el usuario:\n"${ctx.selectedText}"`);
  }

  parts.push('\nPuedes responder preguntas sobre el libro, explicar conceptos, resumir secciones, analizar anotaciones, o generar documentacion basada en el contenido.');

  return parts.join('\n');
}

let msgCounter = 0;
function newId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export function useAIChat(annotations: Annotation[] = []): UseAIChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const aiProvider = useLibraryStore((s) => s.aiProvider);
  const chatContext = useLibraryStore((s) => s.chatContext);

  const doSend = useCallback(async (text: string, extraContext?: string) => {
    if (!aiProvider) {
      setError('Proveedor de IA no configurado. Ve a Ajustes > IA.');
      return;
    }

    setError(null);
    setIsLoading(true);
    abortRef.current = false;

    // Build context with optional extra (selected text, etc.)
    const ctxForPrompt: AIChatContext = { ...chatContext };
    if (extraContext) {
      ctxForPrompt.selectedText = extraContext;
    }

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      contextSnippet: extraContext,
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      // Dynamic import to keep aiService code-split
      const { chatCompletion } = await import('@/services/aiService');

      // Build messages for the API
      const systemPrompt = buildSystemPrompt(ctxForPrompt, annotations);
      const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Include recent conversation history (last 20 messages to avoid token limits)
      const recentMsgs = [...messages, userMsg].slice(-20);
      for (const m of recentMsgs) {
        if (m.role === 'user' || m.role === 'assistant') {
          apiMessages.push({ role: m.role, content: m.content });
        }
      }

      const response = await chatCompletion(aiProvider, apiMessages);

      if (abortRef.current) return;

      const assistantMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Error al comunicar con la IA');
      }
    } finally {
      setIsLoading(false);
    }
  }, [aiProvider, chatContext, annotations, messages]);

  const sendMessage = useCallback((text: string) => doSend(text), [doSend]);
  const sendWithContext = useCallback((text: string, ctx: string) => doSend(text, ctx), [doSend]);

  const clearMessages = useCallback(() => {
    abortRef.current = true;
    setMessages([]);
    setError(null);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages, sendWithContext };
}
