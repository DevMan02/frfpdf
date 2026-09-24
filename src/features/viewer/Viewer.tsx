import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { t } from '../../i18n';
import { PageCanvas } from './PageCanvas';
import type { LoadedPdf } from './pdfjs';
import { PDF_TO_CSS } from './zoom';

/** Horizontal breathing room around the pages, in CSS pixels (both sides together). */
export const VIEWER_GUTTER = 48;

interface ViewerProps {
  doc: LoadedPdf;
  zoom: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onCurrentPageChange: (page: number) => void;
  onWidthChange: (width: number) => void;
  /** Extra layer drawn over each page (form fields, later signatures). `scale` = CSS px per PDF point. */
  renderOverlay?: (pageIndex: number, scale: number) => ReactNode;
}

export const pageElementId = (page: number) => `pagina-${page}`;

export function Viewer({ doc, zoom, scrollRef, onCurrentPageChange, onWidthChange, renderOverlay }: ViewerProps) {
  const scale = zoom * PDF_TO_CSS;
  const total = doc.pages.length;
  // Relative scroll position, used to keep the same spot visible when zooming.
  const scrollRatio = useRef(0);

  // Report the usable width, for "fit to width".
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => onWidthChange(el.clientWidth - VIEWER_GUTTER));
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef, onWidthChange]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = scrollRatio.current * el.scrollHeight;
  }, [scale, scrollRef]);

  const frame = useRef(0);
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      scrollRatio.current = el.scrollHeight ? el.scrollTop / el.scrollHeight : 0;
      // Current page = the last one whose top edge is above the upper third of the view.
      const probe = el.getBoundingClientRect().top + el.clientHeight / 3;
      let current = 1;
      for (let n = 1; n <= total; n++) {
        const page = document.getElementById(pageElementId(n));
        if (page && page.getBoundingClientRect().top <= probe) current = n;
        else break;
      }
      onCurrentPageChange(current);
    });
  }, [scrollRef, total, onCurrentPageChange]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      ref={scrollRef}
      className="viewer"
      onScroll={handleScroll}
      tabIndex={0}
      aria-label={t.viewer.document}
    >
      <div className="viewer__pages">
        {doc.pages.map((size, index) => {
          const n = index + 1;
          return (
            <div key={n} id={pageElementId(n)} className="viewer__page">
              <PageCanvas
                pdf={doc.proxy}
                pageNumber={n}
                scale={scale}
                width={size.width}
                height={size.height}
                rootRef={scrollRef}
                releaseWhenHidden
                className="sheet"
                label={t.viewer.pageLabel(n, total)}
                separateForms={!!renderOverlay}
              />
              {renderOverlay?.(index, scale)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
