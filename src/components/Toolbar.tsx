import { t } from '../i18n';
import { formatZoom, MAX_ZOOM, MIN_ZOOM } from '../features/viewer/zoom';
import { Icon } from './Icon';

interface ToolbarProps {
  fileName: string;
  currentPage: number;
  pageCount: number;
  zoom: number;
  fitWidth: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onOpenClick: () => void;
}

export function Toolbar({
  fileName,
  currentPage,
  pageCount,
  zoom,
  fitWidth,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onOpenClick,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo" title={t.app.documentTitle}>
          {t.app.name}
        </span>
        <span className="toolbar__file" title={fileName}>
          {fileName}
        </span>
      </div>

      <p className="toolbar__page" aria-live="polite">
        {t.toolbar.pageOf(currentPage, pageCount)}
      </p>

      <div className="toolbar__zoom" role="group" aria-label={t.toolbar.zoomLevel}>
        <button
          type="button"
          className="icon-button"
          onClick={onZoomOut}
          disabled={zoom <= MIN_ZOOM}
          aria-label={t.toolbar.zoomOut}
          title={t.toolbar.zoomOut}
        >
          <Icon name="minus" />
        </button>
        <output className="toolbar__zoom-value" aria-label={t.toolbar.zoomLevel}>
          {formatZoom(zoom)}
        </output>
        <button
          type="button"
          className="icon-button"
          onClick={onZoomIn}
          disabled={zoom >= MAX_ZOOM}
          aria-label={t.toolbar.zoomIn}
          title={t.toolbar.zoomIn}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onFitWidth}
          aria-pressed={fitWidth}
          aria-label={t.toolbar.fitWidth}
          title={t.toolbar.fitWidth}
        >
          <Icon name="fitWidth" />
        </button>
      </div>

      <button type="button" className="button button--quiet toolbar__open" onClick={onOpenClick}>
        <Icon name="open" />
        <span>{t.toolbar.openOther}</span>
      </button>
    </header>
  );
}
