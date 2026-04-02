/**
 * SearchPanel — shared in-reader search sidebar for EPUB and PDF.
 * Displays a search input, result list with excerpts, and prev/next navigation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface SearchResult {
  /** Unique ID for keying */
  id: string;
  /** Text excerpt around the match */
  excerpt: string;
  /** Page number (PDF) or section label (EPUB) */
  location: string;
  /** Opaque navigation data (CFI for EPUB, page number for PDF) */
  navData: string | number;
}

interface SearchPanelProps {
  /** Async function that performs the search. Returns results. */
  onSearch: (query: string) => Promise<SearchResult[]>;
  /** Navigate to a specific result */
  onNavigate: (result: SearchResult) => void;
  /** Currently active result index (for highlight) */
  activeIndex?: number;
  /** Optional theme overrides (for EPUB reader) */
  theme?: {
    bg?: string;
    text?: string;
    border?: string;
    muted?: string;
  };
}

export function SearchPanel({ onSearch, onNavigate, activeIndex, theme }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultListRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await onSearch(q);
      setResults(res);
      setCurrentIdx(0);
      if (res.length > 0) {
        onNavigate(res[0]);
      }
    } catch (err) {
      console.warn('Search error:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, onSearch, onNavigate]);

  const goToResult = useCallback((idx: number) => {
    if (results.length === 0) return;
    const clamped = ((idx % results.length) + results.length) % results.length;
    setCurrentIdx(clamped);
    onNavigate(results[clamped]);
    // Scroll the active result into view
    requestAnimationFrame(() => {
      const container = resultListRef.current;
      if (!container) return;
      const el = container.querySelector(`[data-result-idx="${clamped}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [results, onNavigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToResult(currentIdx - 1);
      } else if (results.length > 0 && hasSearched) {
        goToResult(currentIdx + 1);
      } else {
        doSearch();
      }
    }
  }, [doSearch, goToResult, currentIdx, results.length, hasSearched]);

  const displayIdx = activeIndex != null ? activeIndex : currentIdx;

  // Styles: use theme if provided, otherwise use CSS vars
  const bg = theme?.bg || 'var(--color-surface, #fff)';
  const textColor = theme?.text || 'var(--color-text, #1a1a1a)';
  const borderColor = theme?.border || 'var(--color-border, #e0e0e0)';
  const mutedColor = theme?.muted || (theme?.text ? `${theme.text}80` : 'var(--color-text-muted, #999)');

  return (
    <aside
      className="w-80 border-r overflow-hidden shrink-0 flex flex-col"
      style={{ borderColor, background: bg }}
    >
      {/* Search input */}
      <div className="p-3 border-b" style={{ borderColor }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar en el documento..."
              className="w-full px-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:border-primary"
              style={{ borderColor, background: bg, color: textColor }}
            />
          </div>
          <button
            onClick={doSearch}
            disabled={query.trim().length < 2 || isSearching}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {isSearching ? '...' : 'Buscar'}
          </button>
        </div>

        {/* Result count + navigation */}
        {hasSearched && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: mutedColor }}>
              {results.length === 0
                ? 'Sin resultados'
                : `${displayIdx + 1} de ${results.length} resultados`}
            </span>
            {results.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToResult(displayIdx - 1)}
                  className="p-1 rounded hover:opacity-70"
                  title="Anterior (Shift+Enter)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  onClick={() => goToResult(displayIdx + 1)}
                  className="p-1 rounded hover:opacity-70"
                  title="Siguiente (Enter)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result list */}
      <div ref={resultListRef} className="flex-1 overflow-y-auto">
        {results.map((result, idx) => (
          <button
            key={result.id}
            data-result-idx={idx}
            onClick={() => goToResult(idx)}
            className="w-full text-left px-3 py-2.5 border-b transition-colors"
            style={{
              borderColor,
              background: idx === displayIdx ? (theme?.text ? `${theme.text}10` : 'var(--color-surface-hover, #f5f5f5)') : 'transparent',
            }}
          >
            <div className="text-xs font-medium mb-0.5" style={{ color: mutedColor }}>
              {result.location}
            </div>
            <div className="text-sm leading-snug line-clamp-2" style={{ color: textColor }}>
              {highlightExcerpt(result.excerpt, query)}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

/** Highlight matching text in excerpt with bold styling */
function highlightExcerpt(excerpt: string, query: string): React.ReactNode {
  if (!query.trim()) return excerpt;
  const regex = new RegExp(`(${escapeRegex(query.trim())})`, 'gi');
  const parts = excerpt.split(regex);
  if (parts.length <= 1) return excerpt;
  return parts.map((part, i) =>
    regex.test(part)
      ? <strong key={i} className="text-primary">{part}</strong>
      : <span key={i}>{part}</span>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
