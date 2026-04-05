/**
 * PdfScrollPage — renders one PDF page in scroll mode with intersection observer + text layer.
 * Extracted from PdfReader for maintainability.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type * as pdfjsLib from 'pdfjs-dist';
import type { Annotation } from '@/types/annotation';
import { resolveAnnotationFill } from '@/types/annotation';
import { useLibraryStore } from '@/store/libraryStore';
import type { PageLayout, SelectionInfo, RegionDrag, PendingRegion } from './pdfUtils';
import { renderPageToCanvas, renderTextLayer, applyHighlightsToTextLayer, applySearchHighlightToTextLayer, resolveSelection } from './pdfUtils';

interface PdfScrollPageProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  pageLayout: PageLayout;
  scale: number;
  totalPages: number;
  highlights: Annotation[];
  onTextSelection: (sel: SelectionInfo) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onVisible: (pageNum: number) => void;
  annotations: Annotation[];
  textlessPagesRef: React.MutableRefObject<Set<number>>;
  selectedAnnotationId?: string | null;
  onAnnotationClick?: (annotationId: string) => void;
  searchQuery?: string;
  searchHighlightColor?: string;
  annotateMode: boolean;
  regionDrag: RegionDrag | null;
  setRegionDrag: React.Dispatch<React.SetStateAction<RegionDrag | null>>;
  pendingRegion: PendingRegion | null;
  setPendingRegion: React.Dispatch<React.SetStateAction<PendingRegion | null>>;
}

export function PdfScrollPage({
  pdfDoc,
  pageNum,
  pageLayout,
  scale,
  totalPages,
  highlights,
  onTextSelection,
  containerRef,
  onVisible,
  annotations,
  textlessPagesRef,
  selectedAnnotationId,
  onAnnotationClick,
  searchQuery,
  searchHighlightColor,
  annotateMode,
  regionDrag,
  setRegionDrag,
  pendingRegion,
  setPendingRegion,
}: PdfScrollPageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayer2Ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [rendered, setRendered] = useState(false);
  const categories = useLibraryStore((s) => s.annotationCategories);

  const showSecond = pageLayout === 'dual' && pageNum + 1 <= totalPages;

  // Skip even pages in dual layout (they're shown as the second canvas)
  const isDualSecond = pageLayout === 'dual' && pageNum % 2 === 0;

  // Intersection observer
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (entry.intersectionRatio > 0.5) {
            onVisible(pageNum);
          }
        }
      },
      { threshold: [0, 0.5], rootMargin: '200px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNum, onVisible]);

  // Render when in view
  useEffect(() => {
    if (!inView || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;

    async function render() {
      try {
        await renderPageToCanvas(pdfDoc, pageNum, canvasRef.current!, scale);
        if (cancelled) return;
        const hasText = await renderTextLayer(pdfDoc, pageNum, textLayerRef.current!, scale);
        if (cancelled) return;
        if (!hasText) {
          textlessPagesRef.current.add(pageNum);
        } else {
          textlessPagesRef.current.delete(pageNum);
        }
        const pageHl = highlights.filter((h) => h.position.index === pageNum);
        applyHighlightsToTextLayer(textLayerRef.current!, pageHl, categories);
        // Apply search highlights
        if (searchQuery) {
          applySearchHighlightToTextLayer(textLayerRef.current!, searchQuery, searchHighlightColor || '#ff6b00');
        }
        if (!cancelled) setRendered(true);
      } catch (err) {
        console.warn(`Error rendering PDF page ${pageNum}:`, err);
      }

      // Render second page for dual layout
      if (showSecond && canvas2Ref.current && textLayer2Ref.current) {
        try {
          await renderPageToCanvas(pdfDoc, pageNum + 1, canvas2Ref.current, scale);
          if (cancelled) return;
          const hasText = await renderTextLayer(pdfDoc, pageNum + 1, textLayer2Ref.current, scale);
          if (cancelled) return;
          if (!hasText) {
            textlessPagesRef.current.add(pageNum + 1);
          } else {
            textlessPagesRef.current.delete(pageNum + 1);
          }
          const pageHl = highlights.filter((h) => h.position.index === pageNum + 1);
          applyHighlightsToTextLayer(textLayer2Ref.current, pageHl, categories);
          // Apply search highlights
          if (searchQuery) {
            applySearchHighlightToTextLayer(textLayer2Ref.current, searchQuery, searchHighlightColor || '#ff6b00');
          }
        } catch (err) {
          console.warn(`Error rendering PDF page ${pageNum + 1}:`, err);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [inView, pdfDoc, pageNum, scale, showSecond, highlights, textlessPagesRef, searchQuery, searchHighlightColor]);

  // Region drag handlers for annotate mode
  const handleRegionPointerDown = useCallback((e: React.PointerEvent, targetPageNum: number) => {
    if (!annotateMode || pendingRegion) return;
    const canvas = targetPageNum === pageNum ? canvasRef.current : canvas2Ref.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setRegionDrag({ startX: x, startY: y, curX: x, curY: y, page: targetPageNum });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }, [annotateMode, pendingRegion, setRegionDrag, pageNum]);

  const handleRegionPointerMove = useCallback((e: React.PointerEvent) => {
    if (!regionDrag) return;
    const canvas = regionDrag.page === pageNum ? canvasRef.current : canvas2Ref.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setRegionDrag((prev) => prev ? { ...prev, curX: x, curY: y } : null);
    e.preventDefault();
    e.stopPropagation();
  }, [regionDrag, setRegionDrag, pageNum]);

  const handleRegionPointerUp = useCallback((e: React.PointerEvent) => {
    if (!regionDrag) return;
    e.preventDefault();
    e.stopPropagation();

    const rx = Math.min(regionDrag.startX, regionDrag.curX);
    const ry = Math.min(regionDrag.startY, regionDrag.curY);
    const rw = Math.abs(regionDrag.curX - regionDrag.startX);
    const rh = Math.abs(regionDrag.curY - regionDrag.startY);

    const dragPage = regionDrag.page ?? pageNum;
    setRegionDrag(null);

    // Minimum size threshold
    if (rw < 0.02 || rh < 0.02) return;

    setPendingRegion({ x: rx, y: ry, w: rw, h: rh, page: dragPage });
  }, [regionDrag, pageNum, setRegionDrag, setPendingRegion]);

  // Drag rectangle preview (only show on the page being dragged)
  const dragRect = regionDrag && (regionDrag.page === pageNum || regionDrag.page === pageNum + 1) ? {
    left: `${Math.min(regionDrag.startX, regionDrag.curX) * 100}%`,
    top: `${Math.min(regionDrag.startY, regionDrag.curY) * 100}%`,
    width: `${Math.abs(regionDrag.curX - regionDrag.startX) * 100}%`,
    height: `${Math.abs(regionDrag.curY - regionDrag.startY) * 100}%`,
    page: regionDrag.page,
  } : null;

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (annotateMode) return; // In annotate mode, pointer events are for region drag
    const sel = window.getSelection();
    if (!sel || sel.toString().trim().length < 2) return;

    let pn = pageNum;
    let textLayerDiv = textLayerRef.current;

    if (textLayer2Ref.current && sel.anchorNode) {
      if (textLayer2Ref.current.contains(sel.anchorNode)) {
        pn = pageNum + 1;
        textLayerDiv = textLayer2Ref.current;
      }
    }

    if (!textLayerDiv) return;
    const info = resolveSelection(sel, textLayerDiv, pn, containerRef.current);
    if (info) onTextSelection(info);
  }, [pageNum, onTextSelection, containerRef]);

  // In dual layout, skip even-numbered pages (they appear as the right side of the odd page)
  if (isDualSecond) return null;

  // Region overlays for a given page number
  const renderRegionOverlays = (pn: number) => {
    const pageAnnotations = annotations.filter(
      (a) => a.position.index === pn && a.region
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

  return (
    <div
      ref={ref}
      data-page-num={pageNum}
      className="flex items-center justify-center w-full"
      style={{ minHeight: rendered ? undefined : '80vh' }}
      onMouseUp={handleMouseUp}
    >
      {inView ? (
        <div className="flex items-center justify-center gap-2">
          <div className="relative shadow-lg" style={{ maxWidth: showSecond ? '50vw' : '100%' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            <div ref={textLayerRef} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />
            <div className="absolute inset-0 pointer-events-none">
              {renderRegionOverlays(pageNum)}
            </div>
            {/* Annotate mode drag overlay */}
            {annotateMode && !pendingRegion && (
              <div
                className="absolute inset-0 z-10"
                style={{ cursor: 'crosshair', touchAction: 'none' }}
                onPointerDown={(e) => handleRegionPointerDown(e, pageNum)}
                onPointerMove={handleRegionPointerMove}
                onPointerUp={handleRegionPointerUp}
              >
                {dragRect && dragRect.page === pageNum && (
                  <div
                    className="absolute border-2 border-primary bg-primary/20 rounded-sm"
                    style={{ left: dragRect.left, top: dragRect.top, width: dragRect.width, height: dragRect.height }}
                  />
                )}
              </div>
            )}
          </div>
          {showSecond && (
            <div className="relative shadow-lg" style={{ maxWidth: '50vw' }}>
              <canvas ref={canvas2Ref} style={{ display: 'block' }} />
              <div ref={textLayer2Ref} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />
              <div className="absolute inset-0 pointer-events-none">
                {renderRegionOverlays(pageNum + 1)}
              </div>
              {/* Annotate mode drag overlay for second page */}
              {annotateMode && !pendingRegion && (
                <div
                  className="absolute inset-0 z-10"
                  style={{ cursor: 'crosshair', touchAction: 'none' }}
                  onPointerDown={(e) => handleRegionPointerDown(e, pageNum + 1)}
                  onPointerMove={handleRegionPointerMove}
                  onPointerUp={handleRegionPointerUp}
                >
                  {dragRect && dragRect.page === pageNum + 1 && (
                    <div
                      className="absolute border-2 border-primary bg-primary/20 rounded-sm"
                      style={{ left: dragRect.left, top: dragRect.top, width: dragRect.width, height: dragRect.height }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex items-center justify-center" style={{ height: '80vh' }}>
          <span className="text-xs text-text-muted">{showSecond ? `${pageNum}-${pageNum + 1}` : pageNum}</span>
        </div>
      )}
    </div>
  );
}
