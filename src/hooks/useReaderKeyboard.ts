import { useEffect } from 'react';
import { useBackButton } from './useBackButton';

/**
 * Key bindings that each reader provides.
 * Only include the keys your reader supports — undefined keys are ignored.
 */
export interface KeyBindings {
  /** ArrowRight / Space (no shift) */
  next?: () => void;
  /** ArrowLeft / Space+Shift */
  prev?: () => void;
  /** ArrowUp — used by Comic for backward nav */
  up?: () => void;
  /** ArrowDown — used by Comic for forward nav */
  down?: () => void;
  /** Space (no modifier) — used by Video for play/pause */
  space?: () => void;
  /** Escape — cascade close. Return true if handled. */
  escape: () => void;
  /** B key — toggle bookmark */
  bookmark?: () => void;
  /** A key — toggle annotate mode */
  annotate?: () => void;
  /** L key — cycle page layout */
  layout?: () => void;
  /** N key — cycle nav mode */
  navMode?: () => void;
  /** D key — toggle reading direction (RTL) */
  direction?: () => void;
  /** + / = key — zoom in or scale up */
  zoomIn?: () => void;
  /** - key — zoom out or scale down */
  zoomOut?: () => void;
  /** 0 key — reset zoom */
  zoomReset?: () => void;
  /** F key — fit to width */
  fitWidth?: () => void;
  /** Home key — first page */
  home?: () => void;
  /** End key — last page */
  end?: () => void;
}

/**
 * Shared keyboard handler for all readers.
 *
 * Provides the standard guard (skip INPUT/TEXTAREA/contentEditable)
 * and dispatches to the reader's key bindings.
 *
 * On Tauri native, also listens for the Android hardware back button
 * and maps it to the escape binding (cascadeClose).
 *
 * @param bindings Key action map from the reader
 * @param extraListener Optional: also register on another event target (e.g. EPUB rendition)
 */
export function useReaderKeyboard(
  bindings: KeyBindings,
  extraListener?: { on: (event: string, handler: (e: KeyboardEvent) => void) => void; off: (event: string, handler: (e: KeyboardEvent) => void) => void } | null,
) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case 'ArrowRight':
          if (bindings.next) { e.preventDefault(); bindings.next(); }
          break;
        case 'ArrowLeft':
          if (bindings.prev) { e.preventDefault(); bindings.prev(); }
          break;
        case 'ArrowUp':
          if (bindings.up) { e.preventDefault(); bindings.up(); }
          break;
        case 'ArrowDown':
          if (bindings.down) { e.preventDefault(); bindings.down(); }
          break;
        case ' ':
          if (bindings.space) {
            e.preventDefault();
            bindings.space();
          } else if (e.shiftKey && bindings.prev) {
            e.preventDefault();
            bindings.prev();
          } else if (!e.shiftKey && bindings.next) {
            e.preventDefault();
            bindings.next();
          }
          break;
        case 'Escape':
          bindings.escape();
          break;
        case 'b': case 'B':
          bindings.bookmark?.();
          break;
        case 'a': case 'A':
          bindings.annotate?.();
          break;
        case 'l':
          bindings.layout?.();
          break;
        case 'n':
          bindings.navMode?.();
          break;
        case 'd':
          bindings.direction?.();
          break;
        case '+': case '=':
          bindings.zoomIn?.();
          break;
        case '-':
          bindings.zoomOut?.();
          break;
        case '0':
          bindings.zoomReset?.();
          break;
        case 'f':
          bindings.fitWidth?.();
          break;
        case 'Home':
          bindings.home?.();
          break;
        case 'End':
          bindings.end?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    extraListener?.on('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
      extraListener?.off('keydown', handleKey);
    };
  });
  // NOTE: no dependency array — re-registers every render to always have latest bindings.
  // This is intentional: the callbacks close over current state and must stay fresh.
  // The cost is minimal (addEventListener/removeEventListener on each render).

  // Android hardware back button — maps to escape (cascadeClose).
  // Uses the centralized back button stack so reader handlers take priority
  // over the app-level navigation handler.
  useBackButton(() => bindings.escape());
}
