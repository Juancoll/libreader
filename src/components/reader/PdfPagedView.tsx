/**
 * PdfPagedView — renders one (or two) PDF pages on canvas + text layer.
 * Extracted from PdfReader for maintainability.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type * as pdfjsLib from 'pdfjs-dist';
import type { Annotation } from '@/types/annotation';
import { resolveAnnotationFill } from '@/types/annotation';
import { useLibraryStore } from '@/store/libraryStore';
import type { PageLayout, SelectionInfo, RegionDrag, PendingRegion } from './pdfUtils';
import { renderPageToCanvas, renderTextLayer, applyHighlightsToTextLayer, applySearchHighlightToTextLayer, resolveSelection } from './pdfUtils';

interface PdfPagedViewProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  currentPage: number;
  pageLayout: PageLayout;
  scale: number;
  totalPages: number;
  highlights: Annotation[];
  onTextSelection: (sel: SelectionInfo) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  annotateMode: boolean;
  regionDrag: RegionDrag | null;
  setRegionDrag: React.Dispatch<React.SetStateAction<RegionDrag | null>>;
  pendingRegion: PendingRegion | null;
  setPendingRegion: React.Dispatch<React.SetStateAction<PendingRegion | null>>;
  annotations: Annotation[];
  textlessPagesRef: React.MutableRefObject<Set<number>>;
  selectedAnnotationId?: string | null;
  onAnnotationClick?: (annotationId: string) => void;
  searchQuery?: string;
  searchHighlightColor?: string;
}

export function PdfPagedView({
  pdfDoc,
  currentPage,
  pageLayout,
  scale,
  totalPages,
  highlights,
  onTextSelection,
  containerRef,
  annotateMode,
  regionDrag,
  setRegionDrag,
  pendingRegion,
  setPendingRegion,
  annotations,
  textlessPagesRef,
  selectedAnnotationId,
  onAnnotationClick,
  searchQuery,
  searchHighlightColor,
}: PdfPagedViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayer2Ref = useRef<HTMLDivElement>(null);
  const page1WrapperRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const categories = useLibraryStore((s) => s.annotationCategories);
  const showSecond = pageLayout === 'dual' && currentPage + 1 <= totalPages;
  // Display dimensions: canvas rendered at scale, then CSS-sized to fit container
  const [displayDims, setDisplayDims] = useState<{ w1: number; h1: number; w2: number; h2: number }>({ w1: 0, h1: 0, w2: 0, h2: 0 });

  // Compute display dimensions that fit within the available space
  const computeDisplayDims = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const c1 = canvasRef.current;
    if (!c1 || c1.width === 0) return;

    const pad = 32; // p-4 = 16px each side
    const gap = showSecond ? 8 : 0; // gap-2 = 8px
    const availW = outer.clientWidth - pad;
    const availH = outer.clientHeight - pad;
    if (availW <= 0 || availH <= 0) return;

    const slotW = showSecond ? (availW - gap) / 2 : availW;

    // Page 1
    const aspect1 = c1.width / c1.height;
    let w1 = Math.min(slotW, c1.width);
    let h1 = w1 / aspect1;
    if (h1 > availH) { h1 = availH; w1 = h1 * aspect1; }

    // Page 2
    let w2 = 0, h2 = 0;
    const c2 = canvas2Ref.current;
    if (showSecond && c2 && c2.width > 0) {
      const aspect2 = c2.width / c2.height;
      w2 = Math.min(slotW, c2.width);
      h2 = w2 / aspect2;
      if (h2 > availH) { h2 = availH; w2 = h2 * aspect2; }
    }

    setDisplayDims({ w1: Math.round(w1), h1: Math.round(h1), w2: Math.round(w2), h2: Math.round(h2) });
  }, [showSecond]);

  // Recompute on container resize
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => computeDisplayDims());
    ro.observe(outer);
    return () => ro.disconnect();
  }, [computeDisplayDims]);

  // Sync text layer scale: text layer is at render resolution, CSS display is smaller.
  // Applies a CSS scale transform so spans (positioned at render coords) map onto the visible canvas.
  const syncTextLayerScale = useCallback(() => {
    function sync(canvas: HTMLCanvasElement | null, textLayer: HTMLDivElement | null) {
      if (!canvas || !textLayer || canvas.width === 0) return;
      const displayW = canvas.clientWidth;
      const renderW = canvas.width;
      if (renderW > 0 && displayW > 0) {
        const ratio = displayW / renderW;
        textLayer.style.transform = `scale(${ratio})`;
        textLayer.style.transformOrigin = '0 0';
      }
    }
    sync(canvasRef.current, textLayerRef.current);
    sync(canvas2Ref.current, textLayer2Ref.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      // Render first page
      if (canvasRef.current && textLayerRef.current) {
        try {
          await renderPageToCanvas(pdfDoc, currentPage, canvasRef.current, scale);
          if (cancelled) return;
          const hasText = await renderTextLayer(pdfDoc, currentPage, textLayerRef.current, scale);
          if (cancelled) return;
          if (!hasText) {
            textlessPagesRef.current.add(currentPage);
          } else {
            textlessPagesRef.current.delete(currentPage);
          }
          // Apply highlights for this page
          const pageHl = highlights.filter((h) => h.position.index === currentPage);
          applyHighlightsToTextLayer(textLayerRef.current, pageHl, categories);
          // Apply search highlights
          if (searchQuery) {
            applySearchHighlightToTextLayer(textLayerRef.current, searchQuery, searchHighlightColor || '#ff6b00');
          }
        } catch (err) {
          console.warn('Error rendering page:', err);
        }
      }

      // Render second page (dual layout)
      if (showSecond && canvas2Ref.current && textLayer2Ref.current) {
        try {
          await renderPageToCanvas(pdfDoc, currentPage + 1, canvas2Ref.current, scale);
          if (cancelled) return;
          const hasText = await renderTextLayer(pdfDoc, currentPage + 1, textLayer2Ref.current, scale);
          if (cancelled) return;
          if (!hasText) {
            textlessPagesRef.current.add(currentPage + 1);
          } else {
            textlessPagesRef.current.delete(currentPage + 1);
          }
          const pageHl = highlights.filter((h) => h.position.index === currentPage + 1);
          applyHighlightsToTextLayer(textLayer2Ref.current, pageHl, categories);
          // Apply search highlights
          if (searchQuery) {
            applySearchHighlightToTextLayer(textLayer2Ref.current, searchQuery, searchHighlightColor || '#ff6b00');
          }
        } catch (err) {
          console.warn('Error rendering page 2:', err);
        }
      }

      // Compute display dims then sync text layer (double rAF to ensure
      // the browser has applied the new layout before we read clientWidth)
      if (!cancelled) {
        requestAnimationFrame(() => {
          computeDisplayDims();
          requestAnimationFrame(() => {
            if (!cancelled) syncTextLayerScale();
          });
        });
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale, showSecond, highlights, textlessPagesRef, computeDisplayDims, syncTextLayerScale, searchQuery, searchHighlightColor]);

  // Re-sync text layer whenever canvas display size changes (ResizeObserver is more
  // reliable than depending on state changes, since the canvas CSS dimensions might
  // update asynchronously after layout).
  useEffect(() => {
    const canvases = [canvasRef.current, canvas2Ref.current].filter(Boolean) as HTMLCanvasElement[];
    if (canvases.length === 0) return;

    const ro = new ResizeObserver(() => syncTextLayerScale());
    canvases.forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [syncTextLayerScale, showSecond]);

  // Also sync after display dims change (for the initial render path)
  useEffect(() => {
    syncTextLayerScale();
  }, [displayDims, syncTextLayerScale]);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (annotateMode) return; // In annotate mode, pointer events are for region drag
    const sel = window.getSelection();
    if (!sel || sel.toString().trim().length < 2) return;

    // Determine which text layer contains the selection
    let pageNum = currentPage;
    let textLayerDiv = textLayerRef.current;

    if (textLayer2Ref.current && sel.anchorNode) {
      if (textLayer2Ref.current.contains(sel.anchorNode)) {
        pageNum = currentPage + 1;
        textLayerDiv = textLayer2Ref.current;
      }
    }

    if (!textLayerDiv) return;
    const info = resolveSelection(sel, textLayerDiv, pageNum, containerRef.current);
    if (info) onTextSelection(info);
  }, [currentPage, onTextSelection, containerRef, annotateMode]);

  // Region drag handlers
  const handleRegionPointerDown = useCallback((e: React.PointerEvent) => {
    if (!annotateMode || pendingRegion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setRegionDrag({ startX: x, startY: y, curX: x, curY: y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }, [annotateMode, pendingRegion, setRegionDrag]);

  const handleRegionPointerMove = useCallback((e: React.PointerEvent) => {
    if (!regionDrag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setRegionDrag((prev) => prev ? { ...prev, curX: x, curY: y } : null);
    e.preventDefault();
    e.stopPropagation();
  }, [regionDrag, setRegionDrag]);

  const handleRegionPointerUp = useCallback((e: React.PointerEvent) => {
    if (!regionDrag) return;
    e.preventDefault();
    e.stopPropagation();

    const rx = Math.min(regionDrag.startX, regionDrag.curX);
    const ry = Math.min(regionDrag.startY, regionDrag.curY);
    const rw = Math.abs(regionDrag.curX - regionDrag.startX);
    const rh = Math.abs(regionDrag.curY - regionDrag.startY);

    setRegionDrag(null);

    // Minimum size threshold
    if (rw < 0.02 || rh < 0.02) return;

    setPendingRegion({ x: rx, y: ry, w: rw, h: rh, page: currentPage });
  }, [regionDrag, currentPage, setRegionDrag, setPendingRegion]);

  // Region overlays for a given page number
  const renderRegionOverlays = (pageNum: number) => {
    const pageAnnotations = annotations.filter(
      (a) => a.position.index === pageNum && a.region
    );
    if (pageAnnotations.length === 0) return null;

    return pageAnnotations.map((ann) => {
      const isSelected = selectedAnnotationId === ann.id;
      return (
        <div
          key={ann.id}
          className={onAnnotationClick ? 'absolute cursor-pointer' : 'absolute pointer-events-none'}
          onClick={onAnnotationClick ? (e) => { e.stopPropagation(); onAnnotationClick(ann.id); } : undefined}
          style={{
            pointerEvents: onAnnotationClick ? 'auto' : 'none',
            left: `${ann.region!.x * 100}%`,
            top: `${ann.region!.y * 100}%`,
            width: `${ann.region!.w * 100}%`,
            height: `${ann.region!.h * 100}%`,
            backgroundColor: resolveAnnotationFill(ann.style, categories),
            border: isSelected
              ? '2px solid rgba(59,130,246,0.9)'
              : `2px solid ${resolveAnnotationFill(ann.style, categories).replace(/[\d.]+\)$/, '0.8)')}`,
            borderRadius: '2px',
            boxShadow: isSelected ? '0 0 8px rgba(59,130,246,0.4)' : 'none',
          }}
        />
      );
    });
  };

  // Drag rectangle preview
  const dragRect = regionDrag ? {
    left: `${Math.min(regionDrag.startX, regionDrag.curX) * 100}%`,
    top: `${Math.min(regionDrag.startY, regionDrag.curY) * 100}%`,
    width: `${Math.abs(regionDrag.curX - regionDrag.startX) * 100}%`,
    height: `${Math.abs(regionDrag.curY - regionDrag.startY) * 100}%`,
  } : null;

  return (
    <div ref={outerRef} className="flex items-center justify-center gap-2 w-full h-full overflow-auto p-4" onMouseUp={handleMouseUp}>
      <div
        ref={page1WrapperRef}
        className="relative shadow-lg"
        style={displayDims.w1 > 0 ? { width: displayDims.w1, height: displayDims.h1 } : { maxWidth: showSecond ? '50%' : '100%', maxHeight: '100%' }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />
        {/* Region overlays */}
        <div className="absolute inset-0 pointer-events-none">
          {renderRegionOverlays(currentPage)}
        </div>
        {/* Annotate mode drag overlay */}
        {annotateMode && !pendingRegion && (
          <div
            className="absolute inset-0 z-10"
            style={{ cursor: 'crosshair', touchAction: 'none' }}
            onPointerDown={handleRegionPointerDown}
            onPointerMove={handleRegionPointerMove}
            onPointerUp={handleRegionPointerUp}
          >
            {dragRect && (
              <div
                className="absolute border-2 border-primary bg-primary/20 rounded-sm"
                style={dragRect}
              />
            )}
          </div>
        )}
      </div>
      {showSecond && (
        <div
          className="relative shadow-lg"
          style={displayDims.w2 > 0 ? { width: displayDims.w2, height: displayDims.h2 } : { maxWidth: '50%', maxHeight: '100%' }}
        >
          <canvas ref={canvas2Ref} style={{ display: 'block', width: '100%', height: '100%' }} />
          <div ref={textLayer2Ref} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />
          {/* Region overlays for second page */}
          <div className="absolute inset-0 pointer-events-none">
            {renderRegionOverlays(currentPage + 1)}
          </div>
        </div>
      )}
    </div>
  );
}
