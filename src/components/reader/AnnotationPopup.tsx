/**
 * AnnotationPopup — shared floating picker for text selection highlights.
 *
 * If user-defined annotation categories exist, shows category buttons.
 * Otherwise falls back to the 5 default highlight colors.
 *
 * Used by EpubReader, PdfReader, MarkdownViewer, and region annotation flows.
 */

import { useState } from 'react';
import { HIGHLIGHT_COLORS, hexToHighlightFill } from '@/types/annotation';
import type { HighlightColor } from '@/types/annotation';
import { useLibraryStore } from '@/store/libraryStore';

export interface AnnotationPopupProps {
  /** Position relative to the reader container */
  x: number;
  y: number;
  /** Called when user picks a color (and optionally a category) */
  onHighlight: (color: HighlightColor, categoryId?: string) => void;
  /** Called when user dismisses the popup */
  onDismiss: () => void;
  /** Optional theme overrides (for EPUB's custom theming) */
  theme?: { bg?: string; border?: string; text?: string };
}

export function AnnotationPopup({ x, y, onHighlight, onDismiss, theme }: AnnotationPopupProps) {
  const categories = useLibraryStore((s) => s.annotationCategories);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const hasCategories = categories.length > 0;

  return (
    <div
      className="absolute z-50 flex items-center gap-1 p-1.5 rounded-lg shadow-lg bg-surface border border-border"
      style={{
        left: hasCategories ? x - Math.min(categories.length * 20, 120) : x - 80,
        top: y - 45,
        maxWidth: 360,
        ...(theme?.bg ? { background: theme.bg } : {}),
        ...(theme?.border ? { borderColor: theme.border } : {}),
      }}
    >
      {hasCategories ? (
        /* Category buttons */
        <>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onHighlight('yellow', cat.id)}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 shrink-0"
              style={{
                background: hexToHighlightFill(cat.color),
                borderColor: hoveredId === cat.id ? cat.color : 'transparent',
              }}
              title={cat.name}
              onMouseEnter={() => setHoveredId(cat.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          ))}
        </>
      ) : (
        /* Default color circles (fallback) */
        <>
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
            <button
              key={color}
              onClick={() => onHighlight(color)}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: HIGHLIGHT_COLORS[color].fill,
                borderColor: hoveredId === color ? '#6366f1' : 'transparent',
              }}
              title={HIGHLIGHT_COLORS[color].label}
              onMouseEnter={() => setHoveredId(color)}
              onMouseLeave={() => setHoveredId(null)}
            />
          ))}
        </>
      )}
      <button
        onClick={onDismiss}
        className="ml-1 p-1 rounded hover:opacity-70 shrink-0"
      >
        <CloseIcon color={theme?.text} />
      </button>
    </div>
  );
}

// ---- Internal icon ----

function CloseIcon({ color }: { color?: string }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
