// Scroll unit components for comic reader (extracted from ComicReader.tsx)

import { useEffect, useState, useRef, useCallback } from 'react';
import type { ComicPage } from '@/services/comicParser';
import type { Annotation, AnnotationCategory } from '@/types/annotation';
import { resolveAnnotationFill } from '@/types/annotation';
import { useLibraryStore } from '@/store/libraryStore';

type PageLayout = 'single' | 'dual';

// ---- Shared overlay renderer ----

function renderRegionOverlays(
  annotations: Annotation[],
  pageIdx: number,
  categories: AnnotationCategory[],
  selectedAnnotationId?: string | null,
  onAnnotationClick?: (annotationId: string) => void,
) {
  const regions = annotations.filter((a) => a.region && a.position.index === pageIdx + 1);
  if (regions.length === 0) return null;
  return regions.map((ann) => {
    const isSelected = selectedAnnotationId === ann.id;
    return (
      <div
        key={ann.id}
        className={onAnnotationClick ? 'absolute cursor-pointer' : 'absolute pointer-events-none'}
        onClick={onAnnotationClick ? (e) => { e.stopPropagation(); onAnnotationClick(ann.id); } : undefined}
        style={{
          left: `${ann.region!.x * 100}%`,
          top: `${ann.region!.y * 100}%`,
          width: `${ann.region!.w * 100}%`,
          height: `${ann.region!.h * 100}%`,
          background: resolveAnnotationFill(ann.style, categories),
          border: isSelected
            ? '2px solid rgba(255,255,255,0.9)'
            : `2px solid ${resolveAnnotationFill(ann.style, categories).replace(/[\d.]+\)$/, '0.8)')}`,
          borderRadius: 2,
          boxShadow: isSelected ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
        }}
      />
    );
  });
}

// ---- Region draw overlay for scroll units ----

function RegionDrawLayer({
  pageIdx,
  annotateMode,
  pendingPageIdx,
  onRegionComplete,
}: {
  pageIdx: number;
  annotateMode: boolean;
  pendingPageIdx: number | null;
  onRegionComplete: (region: { x: number; y: number; w: number; h: number; pageIdx: number }) => void;
}) {
  const [drag, setDrag] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);

  const getRelCoords = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (!annotateMode || pendingPageIdx !== null) return;
    const { x, y } = getRelCoords(e);
    setDrag({ startX: x, startY: y, curX: x, curY: y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }, [annotateMode, pendingPageIdx, getRelCoords]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = getRelCoords(e);
    setDrag((prev) => prev ? { ...prev, curX: x, curY: y } : null);
    e.preventDefault();
    e.stopPropagation();
  }, [drag, getRelCoords]);

  const onUp = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();

    const rx = Math.min(drag.startX, drag.curX);
    const ry = Math.min(drag.startY, drag.curY);
    const rw = Math.abs(drag.curX - drag.startX);
    const rh = Math.abs(drag.curY - drag.startY);
    setDrag(null);

    if (rw < 0.02 || rh < 0.02) return;
    onRegionComplete({ x: rx, y: ry, w: rw, h: rh, pageIdx: pageIdx + 1 });
  }, [drag, pageIdx, onRegionComplete]);

  if (!annotateMode) return null;

  const dragRect = drag ? {
    left: `${Math.min(drag.startX, drag.curX) * 100}%`,
    top: `${Math.min(drag.startY, drag.curY) * 100}%`,
    width: `${Math.abs(drag.curX - drag.startX) * 100}%`,
    height: `${Math.abs(drag.curY - drag.startY) * 100}%`,
  } : null;

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ cursor: pendingPageIdx !== null ? 'default' : 'crosshair' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {dragRect && (
        <div
          className="absolute border-2 border-dashed border-white/80 bg-white/15 rounded-sm pointer-events-none"
          style={dragRect}
        />
      )}
    </div>
  );
}

// ---- Scroll Vertical Unit Component ----

export function ScrollUnitV({
  unit,
  pages,
  index,
  pageLayout,
  annotations,
  onVisible,
  annotateMode = false,
  pendingPageIdx = null,
  onRegionComplete,
  selectedAnnotationId,
  onAnnotationClick,
}: {
  unit: number[];
  pages: ComicPage[];
  index: number;
  pageLayout: PageLayout;
  annotations: Annotation[];
  onVisible: (index: number) => void;
  annotateMode?: boolean;
  pendingPageIdx?: number | null;
  onRegionComplete?: (region: { x: number; y: number; w: number; h: number; pageIdx: number }) => void;
  selectedAnnotationId?: string | null;
  onAnnotationClick?: (annotationId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const categories = useLibraryStore((s) => s.annotationCategories);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (entry.intersectionRatio > 0.5) {
            onVisible(index);
          }
        }
      },
      { threshold: [0, 0.5], rootMargin: '200px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [index, onVisible]);

  const isDual = pageLayout === 'dual' && unit.length > 1;

  return (
    <div
      ref={ref}
      data-unit-index={index}
      className="flex items-center justify-center w-full"
      style={{ minHeight: loaded ? undefined : '100vh' }}
    >
      {inView ? (
        isDual ? (
          <div className="flex items-center justify-center gap-1 w-full">
            {unit.map((pageIdx) => (
              <div key={pageIdx} className="relative inline-flex items-center justify-center" style={{ maxWidth: '50%' }}>
                <img
                  src={pages[pageIdx]?.url}
                  alt={`Pagina ${pageIdx + 1}`}
                  style={{ maxHeight: '100vh', maxWidth: '100%' }}
                  draggable={false}
                  className="select-none"
                  onLoad={() => setLoaded(true)}
                />
                {renderRegionOverlays(annotations, pageIdx, categories, selectedAnnotationId, onAnnotationClick)}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative inline-flex items-center justify-center" style={{ maxWidth: '100%' }}>
            <img
              src={pages[unit[0]]?.url}
              alt={`Pagina ${unit[0] + 1}`}
              style={{ maxWidth: '100%', maxHeight: '100vh' }}
              draggable={false}
              className="select-none"
              onLoad={() => setLoaded(true)}
            />
            {renderRegionOverlays(annotations, unit[0], categories, selectedAnnotationId, onAnnotationClick)}
            {onRegionComplete && (
              <RegionDrawLayer
                pageIdx={unit[0]}
                annotateMode={annotateMode}
                pendingPageIdx={pendingPageIdx}
                onRegionComplete={onRegionComplete}
              />
            )}
          </div>
        )
      ) : (
        <div className="w-full h-[100vh] flex items-center justify-center">
          <span className="text-xs text-white/20">{unit.map((i) => i + 1).join('-')}</span>
        </div>
      )}
    </div>
  );
}

// ---- Scroll Horizontal Unit Component ----

export function ScrollUnitH({
  unit,
  pages,
  index,
  pageLayout,
  annotations,
  onVisible,
  annotateMode = false,
  pendingPageIdx = null,
  onRegionComplete,
  selectedAnnotationId,
  onAnnotationClick,
}: {
  unit: number[];
  pages: ComicPage[];
  index: number;
  pageLayout: PageLayout;
  annotations: Annotation[];
  onVisible: (index: number) => void;
  annotateMode?: boolean;
  pendingPageIdx?: number | null;
  onRegionComplete?: (region: { x: number; y: number; w: number; h: number; pageIdx: number }) => void;
  selectedAnnotationId?: string | null;
  onAnnotationClick?: (annotationId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const categoriesH = useLibraryStore((s) => s.annotationCategories);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (entry.intersectionRatio > 0.5) {
            onVisible(index);
          }
        }
      },
      { threshold: [0, 0.5], rootMargin: '0px 300px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [index, onVisible]);

  const isDual = pageLayout === 'dual' && unit.length > 1;

  return (
    <div
      ref={ref}
      data-unit-index={index}
      className="flex-shrink-0 flex items-center justify-center h-full"
      style={{
        width: '100vw',
        scrollSnapAlign: 'start',
      }}
    >
      {inView ? (
        isDual ? (
          <div className="flex items-center justify-center gap-1 h-full">
            {unit.map((pageIdx) => (
              <div key={pageIdx} className="relative inline-flex items-center justify-center" style={{ maxWidth: '50%', maxHeight: '100%' }}>
                <img
                  src={pages[pageIdx]?.url}
                  alt={`Pagina ${pageIdx + 1}`}
                  style={{ maxHeight: '100%', maxWidth: '100%' }}
                  draggable={false}
                  className="select-none"
                />
                {renderRegionOverlays(annotations, pageIdx, categoriesH, selectedAnnotationId, onAnnotationClick)}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative inline-flex items-center justify-center" style={{ maxWidth: '100%', maxHeight: '100%' }}>
            <img
              src={pages[unit[0]]?.url}
              alt={`Pagina ${unit[0] + 1}`}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
              draggable={false}
              className="select-none"
            />
            {renderRegionOverlays(annotations, unit[0], categoriesH, selectedAnnotationId, onAnnotationClick)}
            {onRegionComplete && (
              <RegionDrawLayer
                pageIdx={unit[0]}
                annotateMode={annotateMode}
                pendingPageIdx={pendingPageIdx}
                onRegionComplete={onRegionComplete}
              />
            )}
          </div>
        )
      ) : (
        <div className="w-[100vw] h-full flex items-center justify-center">
          <span className="text-xs text-white/20">{unit.map((i) => i + 1).join('-')}</span>
        </div>
      )}
    </div>
  );
}
