/**
 * Shared SVG icons used across multiple readers.
 *
 * Convention: all icons accept `color` (default 'currentColor'),
 * `size` (default 20), and optional `className`.
 * Reader-specific icons stay in their own files (ComicIcons, PdfIcons, etc.).
 */

interface IconProps {
  color?: string;
  size?: number;
  className?: string;
}

// ---- CloseIcon ----
// X mark — used by Epub, Pdf, Comic readers.

export function CloseIcon({ color = 'currentColor', size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---- BookmarkIcon ----
// Bookmark flag — used by Epub, Pdf, Comic readers.

export function BookmarkIcon({ color = 'currentColor', size = 20, className, filled }: IconProps & { filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'currentColor' : color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ---- ChevronIcon ----
// Left/right chevron arrow — used by Epub, Pdf, Comic readers.

export function ChevronIcon({ color = 'currentColor', size = 20, className, direction }: IconProps & { direction: 'left' | 'right' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

// ---- SearchIcon ----
// Magnifying glass — used by Epub, Pdf readers.

export function SearchIcon({ color = 'currentColor', size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ---- AnnotationsDocIcon ----
// Document with fold + text lines — used by Pdf, Comic readers.

export function AnnotationsDocIcon({ color = 'currentColor', size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

// ---- AnnotationsBubbleIcon ----
// Speech bubble — used by Epub reader.

export function AnnotationsBubbleIcon({ color = 'currentColor', size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
