/**
 * AnnotationPopup — shared floating color picker for text selection highlights.
 *
 * Appears near the selected text and lets the user pick a highlight color.
 * Used by EpubReader and PdfReader (and future text-based readers).
 */

import { useState } from 'react';
import { HIGHLIGHT_COLORS } from '@/types/annotation';
import type { HighlightColor } from '@/types/annotation';

export interface AnnotationPopupProps {
  /** Position relative to the reader container */
  x: number;
  y: number;
  /** Called when user picks a color */
  onHighlight: (color: HighlightColor) => void;
  /** Called when user dismisses the popup */
  onDismiss: () => void;
  /** Optional theme overrides (for EPUB's custom theming) */
  theme?: { bg?: string; border?: string; text?: string };
}

export function AnnotationPopup({ x, y, onHighlight, onDismiss, theme }: AnnotationPopupProps) {
  const [hoveredColor, setHoveredColor] = useState<HighlightColor | null>(null);

  return (
    <div
      className="absolute z-50 flex items-center gap-1 p-1.5 rounded-lg shadow-lg bg-surface border border-border"
      style={{
        left: x - 80,
        top: y - 45,
        ...(theme?.bg ? { background: theme.bg } : {}),
        ...(theme?.border ? { borderColor: theme.border } : {}),
      }}
    >
      {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
        <button
          key={color}
          onClick={() => onHighlight(color)}
          className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            background: HIGHLIGHT_COLORS[color].fill,
            borderColor: hoveredColor === color ? '#6366f1' : 'transparent',
          }}
          title={HIGHLIGHT_COLORS[color].label}
          onMouseEnter={() => setHoveredColor(color)}
          onMouseLeave={() => setHoveredColor(null)}
        />
      ))}
      <button
        onClick={onDismiss}
        className="ml-1 p-1 rounded hover:opacity-70"
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
