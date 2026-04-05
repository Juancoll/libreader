/** Reader-specific SVG icons used only by PdfReader */

/** Single page layout: one page rectangle */
export function SinglePageIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5" y="2" width="14" height="20" rx="1" />
    </svg>
  );
}

/** Dual page layout: two page rectangles side by side */
export function DualPageIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="9" height="18" rx="1" />
      <rect x="13" y="3" width="9" height="18" rx="1" />
    </svg>
  );
}

/** Paged navigation mode: a page with a corner fold */
export function PagedModeIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7l-5-5z" />
      <polyline points="14,2 14,7 19,7" />
    </svg>
  );
}

/** Scroll navigation mode: a long document with scroll arrows */
export function ScrollModeIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="1" width="12" height="22" rx="1" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="9,8 12,5 15,8" />
      <polyline points="9,16 12,19 15,16" />
    </svg>
  );
}

export function AnnotateModeIcon() {
  return (
    <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" ry="1" strokeDasharray="3 2" />
    </svg>
  );
}

/** Fit-to-width icon: horizontal arrows expanding to fill width */
export function FitWidthIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <polyline points="7,8 3,12 7,16" />
      <polyline points="17,8 21,12 17,16" />
      <line x1="3" y1="4" x2="3" y2="20" />
      <line x1="21" y1="4" x2="21" y2="20" />
    </svg>
  );
}

/** Fit-to-height icon: vertical arrows expanding to fill height */
export function FitHeightIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <polyline points="8,7 12,3 16,7" />
      <polyline points="8,17 12,21 16,17" />
      <line x1="4" y1="3" x2="20" y2="3" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </svg>
  );
}
