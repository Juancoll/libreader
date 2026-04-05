import { useCallback, useRef, useState } from 'react';

// ---- Constants ----

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;

// ---- Types ----

export interface GestureCallbacks {
  /** Called on swipe-left (or swipe-right when RTL). Default: navigate next. */
  onSwipeForward: () => void;
  /** Called on swipe-right (or swipe-left when RTL). Default: navigate prev. */
  onSwipeBackward: () => void;
  /** Called on single tap in a navigation zone. */
  onTapZone: (clientX: number, clientY: number) => void;
}

export interface GestureOptions {
  /** When true, gesture handlers are disabled (e.g. scroll mode). */
  disabled?: boolean;
  /** Enable double-tap to toggle zoom (Comic uses this, PDF/EPUB don't). */
  doubleTapZoom?: boolean;
}

export interface GestureState {
  zoom: number;
  pan: { x: number; y: number };
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  resetZoom: () => void;
  toggleZoom: () => void;
  adjustZoom: (delta: number) => void;
  /** True if the gesture system is currently in a pinch. Readers can check this to avoid tap logic. */
  isPinching: boolean;
  /** Pointer handlers to spread onto the container element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

/**
 * Shared gesture handling for the three main readers (Comic, PDF, EPUB).
 *
 * Provides:
 * - Pinch-to-zoom with simultaneous center-point panning
 * - Single-finger pan when zoomed (zoom > 1)
 * - 2-finger → 1-finger seamless transition
 * - Swipe detection (dist > 50px, elapsed < 500ms, angle < 1)
 * - Optional double-tap detection (300ms delay to disambiguate)
 * - Tap passthrough for tap-zone navigation
 *
 * Does NOT handle: scroll-mode UI toggle, region annotation drag, text selection.
 * Those remain in each reader.
 */
export function useReaderGestures(
  callbacks: GestureCallbacks,
  options: GestureOptions = {},
): GestureState {
  const { disabled = false, doubleTapZoom = false } = options;

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Touch tracking refs
  const touchStartRef = useRef<{ x: number; y: number; dist?: number; time: number } | null>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const isPinchingRef = useRef(false);
  const pinchStartZoomRef = useRef(1);

  // Double-tap tracking (only when doubleTapZoom is enabled)
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ---- Zoom helpers ----

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleZoom = useCallback(() => {
    setZoom((prev) => {
      if (prev > 1) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      return DOUBLE_TAP_ZOOM;
    });
  }, []);

  const adjustZoom = useCallback((delta: number) => {
    setZoom((prev) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  // ---- Pointer handlers ----

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    touchStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    if (zoom > 1) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [disabled, zoom]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current || zoom <= 1) return;
    const dx = e.clientX - lastPanRef.current.x;
    const dy = e.clientY - lastPanRef.current.y;
    lastPanRef.current = { x: e.clientX, y: e.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, [zoom]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (disabled || isPinchingRef.current) return;
    const start = touchStartRef.current;
    isPanningRef.current = false;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - start.time;
    const clientX = e.clientX;
    const clientY = e.clientY;
    touchStartRef.current = null;

    // Swipe detection (only when not zoomed)
    if (zoom <= 1 && dist > 50 && elapsed < 500) {
      const angle = Math.abs(dy / (dx || 1));
      if (angle < 1) {
        if (dx > 0) callbacks.onSwipeBackward();
        else callbacks.onSwipeForward();
      }
      return;
    }

    // Tap threshold: too much movement or too long = not a tap
    if (dist >= 15 || elapsed >= 400) return;

    // If there's an active text selection, don't fire tap zone (the user just finished selecting text)
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;

    // Double-tap detection (when enabled)
    if (doubleTapZoom) {
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        // Double tap detected
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = undefined;
        }
        lastTapRef.current = 0;
        toggleZoom();
        return;
      }
      lastTapRef.current = now;
      // Delay single-tap to wait for potential double-tap
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = undefined;
        callbacks.onTapZone(clientX, clientY);
      }, 300);
    } else {
      // No double-tap: fire tap zone immediately
      callbacks.onTapZone(clientX, clientY);
    }
  }, [disabled, zoom, doubleTapZoom, callbacks, toggleZoom]);

  // ---- Pinch-to-zoom with center-point panning ----

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      touchStartRef.current = { x: cx, y: cy, dist, time: Date.now() };
      isPinchingRef.current = true;
      pinchStartZoomRef.current = zoom;
      lastPanRef.current = { x: cx, y: cy };
      // Cancel any pending single-tap
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = undefined;
      }
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current?.dist && isPinchingRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / touchStartRef.current.dist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoomRef.current * scale));

      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const panDx = cx - lastPanRef.current.x;
      const panDy = cy - lastPanRef.current.y;
      lastPanRef.current = { x: cx, y: cy };

      setZoom(newZoom);
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
      } else {
        setPan((prev) => ({ x: prev.x + panDx, y: prev.y + panDy }));
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length < 2) {
      isPinchingRef.current = false;
      // If one finger remains while zoomed, start single-finger pan
      if (e.touches.length === 1 && zoom > 1) {
        isPanningRef.current = true;
        lastPanRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }, [zoom]);

  return {
    zoom,
    pan,
    setZoom,
    setPan,
    resetZoom,
    toggleZoom,
    adjustZoom,
    isPinching: isPinchingRef.current,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
