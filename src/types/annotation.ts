/**
 * Unified Annotation System
 *
 * A single Annotation type that works across all content formats:
 * EPUB, PDF, Comic (CBZ/CBR), Markdown, and future video/audio.
 *
 * An annotation always has a `position` (where in the document) and a `style` (how it looks).
 * It optionally has:
 * - `textSelection` — when highlighting text (EPUB, PDF text, Markdown)
 * - `region` — when marking a visual area (Comic, PDF image, video frame)
 * - `note` — user-written text note
 * - `voiceIds` — linked voice comment IDs
 */

// ---- Position: WHERE in the document ----

export interface DocumentPosition {
  /** Page number or logical unit (1-indexed) */
  index?: number;
  /** Progress relative to total document length, 0–1 */
  fraction?: number;
  /** EPUB: CFI string for precise position */
  cfi?: string;
  /** Temporal media: start time in seconds */
  timeStart?: number;
  /** Temporal media: end time in seconds */
  timeEnd?: number;
}

// ---- Region: WHAT AREA of the page is marked (for images/video) ----

export interface SpatialRegion {
  /** X coordinate relative to page width (0–1) */
  x: number;
  /** Y coordinate relative to page height (0–1) */
  y: number;
  /** Width relative to page width (0–1) */
  w: number;
  /** Height relative to page height (0–1) */
  h: number;
}

// ---- Text Selection: WHAT TEXT is highlighted ----

export interface TextSelection {
  /** The selected text content */
  text: string;
  /** EPUB: CFI range for the selection */
  cfiRange?: string;
  /** PDF: index of the first text content item in the text layer */
  startItemIdx?: number;
  /** PDF: character offset within the first item */
  startCharOffset?: number;
  /** PDF: index of the last text content item */
  endItemIdx?: number;
  /** PDF: character offset within the last item */
  endCharOffset?: number;
  /** Markdown: start offset in raw content */
  startOffset?: number;
  /** Markdown: end offset in raw content */
  endOffset?: number;
}

// ---- Style: HOW it looks ----

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple';

export interface HighlightStyle {
  color: HighlightColor;
  /** Opacity of the highlight overlay, 0–1 (default 0.3) */
  opacity?: number;
  /** Optional category ID — links to a user-defined AnnotationCategory */
  categoryId?: string;
}

/** Color config for rendering highlights in the UI */
export const HIGHLIGHT_COLORS: Record<HighlightColor, { fill: string; label: string }> = {
  yellow: { fill: 'rgba(255,255,0,0.35)', label: 'Amarillo' },
  green: { fill: 'rgba(0,200,83,0.3)', label: 'Verde' },
  blue: { fill: 'rgba(66,133,244,0.3)', label: 'Azul' },
  red: { fill: 'rgba(234,67,53,0.3)', label: 'Rojo' },
  purple: { fill: 'rgba(156,39,176,0.3)', label: 'Morado' },
};

// ---- Annotation Categories ----

export interface AnnotationCategory {
  /** Unique identifier */
  id: string;
  /** User-facing name (e.g. "Vocabulario", "Idea clave") */
  name: string;
  /** Hex color string (e.g. "#ff6b6b") — used for highlight fill */
  color: string;
  /** Optional description */
  description: string;
}

/**
 * Convert a hex color to an rgba fill string with 0.3 opacity for highlights.
 */
export function hexToHighlightFill(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.3)`;
}

/**
 * Resolve the fill color for an annotation.
 * If the annotation has a categoryId and matching category exists, use the category's color.
 * Otherwise fall back to HIGHLIGHT_COLORS[style.color].
 */
export function resolveAnnotationFill(
  style: HighlightStyle,
  categories: AnnotationCategory[],
): string {
  if (style.categoryId) {
    const cat = categories.find((c) => c.id === style.categoryId);
    if (cat) return hexToHighlightFill(cat.color);
  }
  return HIGHLIGHT_COLORS[style.color]?.fill ?? HIGHLIGHT_COLORS.yellow.fill;
}

/**
 * Resolve the category name for an annotation (if any).
 */
export function resolveAnnotationCategoryName(
  style: HighlightStyle,
  categories: AnnotationCategory[],
): string | undefined {
  if (style.categoryId) {
    const cat = categories.find((c) => c.id === style.categoryId);
    if (cat) return cat.name;
  }
  return undefined;
}

/**
 * Generate a unique ID for a category.
 */
export function generateCategoryId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- The main entity ----

export interface Annotation {
  /** Unique identifier */
  id: string;

  /** Where in the document this annotation is anchored */
  position: DocumentPosition;

  /** Visual region (for image-based content: comics, PDF scans, video) */
  region?: SpatialRegion;

  /** Text selection (for text-based content: EPUB, PDF text, Markdown) */
  textSelection?: TextSelection;

  /** Visual style of the highlight */
  style: HighlightStyle;

  /** User-written note (empty string if none) */
  note: string;

  /** IDs of voice comments attached to this annotation */
  voiceIds: string[];

  /** Chapter or section name (for grouping in the annotations panel) */
  chapter?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * A bookmark is an Annotation with only a position — no text selection, no region.
 * It marks a place in the document the user wants to return to.
 * Bookmarks have a fixed style and no note by default (though note is allowed).
 */
export function isBookmark(annotation: Annotation): boolean {
  return !annotation.textSelection && !annotation.region;
}

/**
 * Generate a unique ID for an annotation.
 */
export function generateAnnotationId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
