/**
 * PDF rendering utilities: canvas rendering, text layer, highlight application,
 * and text selection resolution.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { Annotation, AnnotationCategory } from '@/types/annotation';
import { resolveAnnotationFill } from '@/types/annotation';

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
  page?: number;
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

  // Set CSS variables needed by the pdf.js text layer CSS rules.
  // --total-scale-factor drives font-size, --scale-round-x/y are used for rounding.
  // In the official viewer: --total-scale-factor = viewport.scale * userUnit (userUnit=1).
  container.style.setProperty('--total-scale-factor', `${viewport.scale}`);
  container.style.setProperty('--scale-round-x', '1px');
  container.style.setProperty('--scale-round-y', '1px');

  const hasText = textContent.items.length > 0;

  if (hasText) {
    const textLayer = new TextLayer({
      textContentSource: textContent,
      container,
      viewport,
    });

    await textLayer.render();
  }

  // Set explicit dimensions at viewport (render) resolution AFTER render,
  // because the TextLayer constructor calls setLayerDimensions which may set
  // calc()-based dimensions that depend on CSS vars like --scale-round-x.
  // We override with fixed values to ensure consistent sizing.
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

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
  categories: AnnotationCategory[] = [],
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
    applyHighlightsToSpans(allSpans, highlights, categories);
    return;
  }
  applyHighlightsToSpans(spans, highlights, categories);
}

function applyHighlightsToSpans(spans: Element[], highlights: Annotation[], categories: AnnotationCategory[]) {
  for (const hl of highlights) {
    const startIdx = hl.textSelection?.startItemIdx ?? 0;
    const endIdx = hl.textSelection?.endItemIdx ?? 0;
    for (let i = startIdx; i <= endIdx && i < spans.length; i++) {
      const span = spans[i] as HTMLElement;
      span.style.backgroundColor = resolveAnnotationFill(hl.style, categories);
      span.style.borderRadius = '2px';
      span.setAttribute('data-hl-id', hl.id);
    }
  }
}

// ---- Search highlight ----

/**
 * Highlight all occurrences of `query` in the text layer with the given color.
 * Removes previous search highlights first.
 */
export function applySearchHighlightToTextLayer(
  textLayerDiv: HTMLDivElement,
  query: string,
  highlightColor: string,
) {
  // Clear previous search highlights
  clearSearchHighlights(textLayerDiv);

  if (!textLayerDiv || !query || query.length < 2) return;

  const lowerQuery = query.toLowerCase();

  // Get all text spans in the text layer
  let spans = Array.from(textLayerDiv.querySelectorAll('span[role="presentation"]'));
  if (spans.length === 0) {
    spans = Array.from(textLayerDiv.querySelectorAll('span'));
  }
  if (spans.length === 0) return;

  // Build the full page text from spans, tracking span boundaries
  const spanTexts: { span: HTMLElement; text: string; start: number }[] = [];
  let fullText = '';
  for (const span of spans) {
    const text = span.textContent || '';
    spanTexts.push({ span: span as HTMLElement, text, start: fullText.length });
    fullText += text + ' '; // spaces between spans (matching handlePdfSearch join)
  }

  const lowerFull = fullText.toLowerCase();
  let searchIdx = 0;

  while (true) {
    const idx = lowerFull.indexOf(lowerQuery, searchIdx);
    if (idx === -1) break;
    const matchEnd = idx + query.length;

    // Find which spans overlap with [idx, matchEnd)
    for (const { span, start, text } of spanTexts) {
      const spanEnd = start + text.length;
      if (spanEnd > idx && start < matchEnd) {
        span.setAttribute('data-search-hl', 'true');
        span.style.backgroundColor = highlightColor + '66'; // add alpha for semi-transparency
        span.style.borderRadius = '2px';
      }
    }

    searchIdx = idx + query.length;
  }
}

/**
 * Remove all search highlights from a text layer div.
 */
export function clearSearchHighlights(textLayerDiv: HTMLDivElement | null) {
  if (!textLayerDiv) return;
  textLayerDiv.querySelectorAll('[data-search-hl]').forEach((el) => {
    const htmlEl = el as HTMLElement;
    // Only clear if not also an annotation highlight
    if (!htmlEl.hasAttribute('data-hl-id')) {
      htmlEl.style.backgroundColor = '';
      htmlEl.style.borderRadius = '';
    }
    htmlEl.removeAttribute('data-search-hl');
  });
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
