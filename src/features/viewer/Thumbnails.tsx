import { useEffect, useRef } from 'react';
import { t } from '../../i18n';
import { PageCanvas } from './PageCanvas';
import type { LoadedPdf } from './pdfjs';

/** Thumbnail width in CSS pixels. */
const THUMB_WIDTH = 96;

interface ThumbnailsProps {
  doc: LoadedPdf;
  currentPage: number;
  onSelect: (page: number) => void;
}

export function Thumbnails({ doc, currentPage, onSelect }: ThumbnailsProps) {
  const listRef = useRef<HTMLElement>(null);

  // Keep the active thumbnail visible while the document scrolls.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [currentPage]);

  return (
    <nav ref={listRef} className="thumbs" aria-label={t.viewer.pages}>
      <ol className="thumbs__list">
        {doc.pages.map((size, index) => {
          const n = index + 1;
          const scale = THUMB_WIDTH / Math.max(size.width, size.height * 0.75);
          return (
            <li key={n}>
              <button
                type="button"
                className="thumbs__item"
                aria-current={n === currentPage ? 'page' : undefined}
                aria-label={t.viewer.goToPage(n)}
                onClick={() => onSelect(n)}
              >
                <PageCanvas
                  pdf={doc.proxy}
                  pageNumber={n}
                  scale={scale}
                  width={size.width}
                  height={size.height}
                  rootRef={listRef}
                  className="sheet sheet--thumb"
                />
                <span className="thumbs__number">{n}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
