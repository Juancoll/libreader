/**
 * PDF rendering utilities: canvas rendering, text layer, highlight application,
 * and text selection resolution.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { Annotation } from '@/types/annotation';
import { HIGHLIGHT_COLORS } from '@/types/annotation';

// ---- Types ----

export type PageLayout = 'single' | 'dual';

export interface PageRenderResult {
  width: number;
  height: number;
}

export interface SelectionInfo {
  page: number;
  text: string;
  startItemIdx: number;
  startCharOffset: number;
  endItemIdx: number;
  endCharOffset: number;
  /** Position for popup (relative to container) */
  x: number;
  y: number;
}

export interface RegionDrag {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export interface PendingRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

// ---- Render helpers ----

export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<PageRenderResult> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height };
}

export async function renderTextLayer(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  container: HTMLDivElement,
  scale: number,
): Promise<boolean> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  // Clear previous text layer
  container.innerHTML = '';
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

  const hasText = textContent.items.length > 0;

  if (hasText) {
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container,
      viewport,
    });

    await textLayer.render();
  }

  return hasText;
}

// ---- Highlight application ----

/**
 * Apply highlight styling to the text layer.
 * Wraps text content item spans that fall within highlight ranges with background colors.
 */
export function applyHighlightsToTextLayer(
  textLayerDiv: HTMLDivElement,
  highlights: Annotation[],
) {
  if (!textLayerDiv || highlights.length === 0) return;

  // Reset any previous highlight styling
  textLayerDiv.querySelectorAll('[data-hl-id]').forEach((el) => {
    (el as HTMLElement).style.backgroundColor = '';
    (el as HTMLElement).style.borderRadius = '';
    el.removeAttribute('data-hl-id');
  });

  // The text layer renders spans in order matching text content items.
  // We find spans by index and apply background color.
  const spans = Array.from(textLayerDiv.querySelectorAll('span[role="presentation"]'));
  if (spans.length === 0) {
    // Fallback: try all direct spans
    const allSpans = Array.from(textLayerDiv.querySelectorAll('span'));
    if (allSpans.length === 0) return;
    applyHighlightsToSpans(allSpans, highlights);
    return;
  }
  applyHighlightsToSpans(spans, highlights);
}

function applyHighlightsToSpans(spans: Element[], highlights: Annotation[]) {
  for (const hl of highlights) {
    const startIdx = hl.textSelection?.startItemIdx ?? 0;
    const endIdx = hl.textSelection?.endItemIdx ?? 0;
    for (let i = startIdx; i <= endIdx && i < spans.length; i++) {
      const span = spans[i] as HTMLElement;
      span.style.backgroundColor = HIGHLIGHT_COLORS[hl.style.color].fill;
      span.style.borderRadius = '2px';
      span.setAttribute('data-hl-id', hl.id);
    }
  }
}

// ---- Selection resolution ----

/**
 * Resolve a browser Selection into a SelectionInfo for the given page,
 * using the text layer spans' order as indices.
 */
export function resolveSelection(
  selection: Selection,
  textLayerDiv: HTMLDivElement,
  pageNum: number,
  containerEl: HTMLElement | null,
): SelectionInfo | null {
  if (!selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  if (text.length < 2) return null;

  // Find all presentation spans
  let spans = Array.from(textLayerDiv.querySelectorAll('span[role="presentation"]'));
  if (spans.length === 0) {
    spans = Array.from(textLayerDiv.querySelectorAll('span'));
  }
  if (spans.length === 0) return null;

  // Find start and end span indices
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < spans.length; i++) {
    if (range.intersectsNode(spans[i])) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  }

  if (startIdx === -1) return null;

  // Calculate popup position relative to container
  const rect = range.getBoundingClientRect();
  const containerRect = containerEl?.getBoundingClientRect() || { left: 0, top: 0 };

  return {
    page: pageNum,
    text,
    startItemIdx: startIdx,
    startCharOffset: 0, // Simplified: we track at span granularity
    endItemIdx: endIdx,
    endCharOffset: 0,
    x: rect.left - containerRect.left + rect.width / 2,
    y: rect.top - containerRect.top - 10,
  };
}
