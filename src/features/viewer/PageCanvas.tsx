import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnnotationMode, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';

/** Hard cap on canvas size: very large canvases fail silently on mobile browsers. */
const MAX_CANVAS_PIXELS = 16_777_216;

interface PageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** CSS pixels per PDF point. */
  scale: number;
  /** Page size in PDF points (rotation applied). */
  width: number;
  height: number;
  /** Scroll container used to decide when the page is near the screen. */
  rootRef: RefObject<HTMLElement | null>;
  /** Drop the bitmap when the page scrolls far away (saves memory on long documents). */
  releaseWhenHidden?: boolean;
  className?: string;
  /** Accessible name; leave empty for decorative copies such as thumbnails. */
  label?: string;
  /**
   * true: form fields are left out of the bitmap because FrFPDF draws its own
   * editable fields on top (read-only fields and signatures are still drawn).
   */
  separateForms?: boolean;
}

/**
 * Renders one PDF page lazily: only when it gets close to the visible area.
 * Each render draws into a fresh canvas that replaces the old one when ready,
 * so zooming never shows a blank page and never overlaps two render tasks.
 */
export function PageCanvas({
  pdf,
  pageNumber,
  scale,
  width,
  height,
  rootRef,
  releaseWhenHidden = false,
  className,
  label,
  separateForms = false,
}: PageCanvasProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [nearScreen, setNearScreen] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new IntersectionObserver(
      (entries) => setNearScreen(entries.some((entry) => entry.isIntersecting)),
      { root: rootRef.current, rootMargin: '100% 0px' },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    if (!nearScreen) {
      if (releaseWhenHidden) holder.replaceChildren();
      return;
    }

    let task: RenderTask | undefined;
    let cancelled = false;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const cssViewport = page.getViewport({ scale });
      const area = cssViewport.width * cssViewport.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / area));
      const viewport = page.getViewport({ scale: scale * pixelRatio });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute('aria-hidden', 'true');

      task = page.render({
        canvas,
        viewport,
        annotationMode: separateForms ? AnnotationMode.ENABLE_FORMS : AnnotationMode.ENABLE,
      });
      try {
        await task.promise;
      } catch (error) {
        if ((error as Error | undefined)?.name === 'RenderingCancelledException') return;
        throw error;
      }
      if (!cancelled) holder.replaceChildren(canvas);
    })().catch((error: unknown) => console.error(`Rendering page ${pageNumber} failed`, error));

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, scale, nearScreen, releaseWhenHidden, separateForms]);

  return (
    <div
      ref={holderRef}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ width: `${width * scale}px`, height: `${height * scale}px` }}
    />
  );
}
