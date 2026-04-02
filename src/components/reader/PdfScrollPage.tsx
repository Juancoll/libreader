/**
 * PdfScrollPage — renders one PDF page in scroll mode with intersection observer + text layer.
 * Extracted from PdfReader for maintainability.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type * as pdfjsLib from 'pdfjs-dist';
import type { Annotation } from '@/types/annotation';
import { HIGHLIGHT_COLORS } from '@/types/annotation';
import type { PageLayout, SelectionInfo } from './pdfUtils';
import { renderPageToCanvas, renderTextLayer, applyHighlightsToTextLayer, resolveSelection } from './pdfUtils';

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
}: PdfScrollPageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayer2Ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [rendered, setRendered] = useState(false);

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
        applyHighlightsToTextLayer(textLayerRef.current!, pageHl);
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
          applyHighlightsToTextLayer(textLayer2Ref.current, pageHl);
        } catch (err) {
          console.warn(`Error rendering PDF page ${pageNum + 1}:`, err);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [inView, pdfDoc, pageNum, scale, showSecond, highlights, textlessPagesRef]);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
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
            backgroundColor: HIGHLIGHT_COLORS[ann.style.color].fill,
            border: isSelected
              ? '2px solid rgba(59,130,246,0.9)'
              : `2px solid ${HIGHLIGHT_COLORS[ann.style.color].fill.replace(/[\d.]+\)$/, '0.8)')}`,
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
          </div>
          {showSecond && (
            <div className="relative shadow-lg" style={{ maxWidth: '50vw' }}>
              <canvas ref={canvas2Ref} style={{ display: 'block' }} />
              <div ref={textLayer2Ref} className="textLayer" style={{ position: 'absolute', top: 0, left: 0 }} />
              <div className="absolute inset-0 pointer-events-none">
                {renderRegionOverlays(pageNum + 1)}
              </div>
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
