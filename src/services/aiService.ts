/**
 * AI Service — Unified abstraction over multiple LLM providers.
 *
 * Supports: OpenAI, Anthropic, GitHub Models, Ollama.
 * Uses Tauri HTTP plugin when running natively (no CORS), fetch otherwise.
 */

import type { AIProviderConfig } from '@/store/libraryStore';
import { isTauriNative } from './tauriFS';

// ---- Types ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  content: string;
}

// ---- HTTP layer ----

async function tauriFetch(url: string, options: { method: string; headers: Record<string, string>; body?: string }): Promise<{ status: number; data: unknown }> {
  const { fetch: tFetch } = await import('@tauri-apps/plugin-http');
  const res = await tFetch(url, {
    method: options.method,
    headers: options.headers,
    body: options.body ? options.body : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function httpPost(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; data: unknown }> {
  const allHeaders = { 'Content-Type': 'application/json', ...headers };
  const bodyStr = JSON.stringify(body);

  if (isTauriNative()) {
    return tauriFetch(url, { method: 'POST', headers: allHeaders, body: bodyStr });
  }

  // Web fallback — try direct, fall back to dev proxy
  const doFetch = async (targetUrl: string) => {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: allHeaders,
      body: bodyStr,
    });
    return { status: res.status, data: await res.json() };
  };

  try {
    return await doFetch(url);
  } catch {
    // CORS failure — try dev proxy at localhost:3001
    const proxyUrl = `http://localhost:3001/proxy`;
    return doFetch(proxyUrl + '?' + new URLSearchParams({ url }));
  }
}

async function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ status: number; data: unknown }> {
  if (isTauriNative()) {
    return tauriFetch(url, { method: 'GET', headers });
  }

  const doFetch = async (targetUrl: string) => {
    const res = await fetch(targetUrl, { headers });
    return { status: res.status, data: await res.json() };
  };

  try {
    return await doFetch(url);
  } catch {
    const proxyUrl = `http://localhost:3001/proxy`;
    return doFetch(proxyUrl + '?' + new URLSearchParams({ url }));
  }
}

// ---- Provider-specific chat ----

function getEndpointAndHeaders(config: AIProviderConfig): { url: string; headers: Record<string, string> } {
  switch (config.type) {
    case 'openai':
      return {
        url: config.baseUrl || 'https://api.openai.com/v1/chat/completions',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      };
    case 'github':
      return {
        url: config.baseUrl || 'https://models.inference.ai.azure.com/chat/completions',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      };
    case 'ollama':
      return {
        url: `${config.baseUrl || 'http://localhost:11434'}/api/chat`,
        headers: {},
      };
    case 'anthropic':
      return {
        url: config.baseUrl || 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      };
    default:
      throw new Error(`Provider desconocido: ${config.type}`);
  }
}

function buildRequestBody(config: AIProviderConfig, messages: ChatMessage[]): unknown {
  if (config.type === 'anthropic') {
    const system = messages.find((m) => m.role === 'system')?.content;
    const nonSystem = messages.filter((m) => m.role !== 'system');
    return {
      model: config.model,
      max_tokens: 2048,
      system: system || undefined,
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  if (config.type === 'ollama') {
    return {
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };
  }

  // OpenAI / GitHub Models
  return {
    model: config.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: 2048,
  };
}

function extractContent(config: AIProviderConfig, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (config.type === 'anthropic') {
    const content = d.content as Array<{ text: string }>;
    return content?.[0]?.text || '';
  }
  if (config.type === 'ollama') {
    const msg = d.message as { content: string };
    return msg?.content || '';
  }
  // OpenAI / GitHub
  const choices = d.choices as Array<{ message: { content: string } }>;
  return choices?.[0]?.message?.content || '';
}

// ---- Public API ----

export async function chatCompletion(config: AIProviderConfig, messages: ChatMessage[]): Promise<ChatResponse> {
  const { url, headers } = getEndpointAndHeaders(config);
  const body = buildRequestBody(config, messages);
  const { status, data } = await httpPost(url, headers, body);

  if (status >= 400) {
    const errMsg = typeof data === 'object' && data !== null
      ? JSON.stringify(data).slice(0, 200)
      : String(data);
    throw new Error(`AI API error (${status}): ${errMsg}`);
  }

  return { content: extractContent(config, data) };
}

export async function testAIProvider(config: AIProviderConfig): Promise<boolean> {
  try {
    if (config.type === 'ollama') {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      const { status } = await httpGet(`${baseUrl}/api/tags`);
      return status === 200;
    }

    const result = await chatCompletion(config, [
      { role: 'user', content: 'Responde solo "ok".' },
    ]);
    return result.content.toLowerCase().includes('ok');
  } catch {
    return false;
  }
}

// ---- Import enrichment prompts ----

const SYSTEM_PROMPT = `Eres un bibliotecario experto. Respondes siempre en JSON valido, sin markdown ni explicaciones adicionales. Solo el JSON pedido.`;

export interface EnrichResult {
  title?: string;
  subtitle?: string;
  authors?: string[];
  year?: string;
  publisher?: string;
  language?: string;
  isbn?: string;
  pages?: number;
  summary?: string;
  tags?: string[];
}

export async function enrichMetadata(
  config: AIProviderConfig,
  currentMeta: { title: string; authors: string[]; format: string; isbn?: string },
): Promise<EnrichResult> {
  const prompt = `Tengo un ${currentMeta.format.toUpperCase()} con estos datos:
- Titulo: "${currentMeta.title}"
- Autores: ${currentMeta.authors.length > 0 ? currentMeta.authors.join(', ') : 'desconocido'}
${currentMeta.isbn ? `- ISBN: ${currentMeta.isbn}` : ''}

Busca informacion sobre este libro/contenido y devuelve un JSON con los campos que puedas completar:
{
  "title": "titulo corregido si es necesario",
  "subtitle": "subtitulo si existe",
  "authors": ["autor1", "autor2"],
  "year": "ano de publicacion",
  "publisher": "editorial",
  "language": "idioma (es, en, etc)",
  "isbn": "isbn si lo conoces",
  "pages": 123,
  "summary": "resumen breve en 2-3 frases en espanol",
  "tags": ["#categoria/subcategoria", "#tema"]
}

Solo incluye campos de los que estes seguro. Los tags deben usar el formato #categoria/subcategoria con prefijo #.`;

  const result = await chatCompletion(config, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]);

  return parseJSON<EnrichResult>(result.content);
}

export async function suggestTags(
  config: AIProviderConfig,
  meta: { title: string; authors: string[]; format: string; existingTags: string[] },
): Promise<string[]> {
  const prompt = `Sugiere tags para este contenido:
- Titulo: "${meta.title}"
- Autores: ${meta.authors.join(', ') || 'desconocido'}
- Formato: ${meta.format}
${meta.existingTags.length > 0 ? `- Tags ya existentes en la biblioteca: ${meta.existingTags.slice(0, 30).join(', ')}` : ''}

Devuelve un JSON array de strings con 3-7 tags relevantes. Usa el formato #categoria/subcategoria con prefijo #. Prioriza tags que ya existan en la biblioteca si aplican.

Ejemplo: ["#informatica/programacion", "#ciencia/fisica"]`;

  const result = await chatCompletion(config, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]);

  const tags = parseJSON<string[]>(result.content);
  return Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [];
}

export async function generateSummary(
  config: AIProviderConfig,
  meta: { title: string; authors: string[]; format: string },
): Promise<string> {
  const prompt = `Genera un resumen breve (2-4 frases) en espanol de este contenido:
- Titulo: "${meta.title}"
- Autores: ${meta.authors.join(', ') || 'desconocido'}
- Formato: ${meta.format}

Devuelve solo el texto del resumen, sin JSON ni comillas.`;

  const result = await chatCompletion(config, [
    { role: 'system', content: 'Eres un bibliotecario experto. Respondes de forma concisa en espanol.' },
    { role: 'user', content: prompt },
  ]);

  return result.content.trim();
}

// ---- Helpers ----

function parseJSON<T>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}
