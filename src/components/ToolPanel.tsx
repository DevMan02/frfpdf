import { t } from '../i18n';
import { Icon } from './Icon';
import { PrivacyNote } from './PrivacyNote';

interface ToolPanelProps {
  pageCount: number;
  saving: boolean;
  status: string;
  onDownload: () => void;
}

/** Right-hand panel on desktop, bottom bar on mobile. Later phases add form, signature and page tools here. */
export function ToolPanel({ pageCount, saving, status, onDownload }: ToolPanelProps) {
  return (
    <aside className="tools" aria-label={t.tools.title}>
      <div className="tools__body">
        <p className="tools__meta">{t.viewer.pageCount(pageCount)}</p>
      </div>

      <div className="tools__footer">
        <button type="button" className="button button--primary tools__download" onClick={onDownload} disabled={saving}>
          <Icon name="download" />
          {saving ? t.status.preparing : t.tools.download}
        </button>
        <p className="tools__hint">{t.tools.originalUntouched}</p>
        <p className="tools__status" role="status">
          {status}
        </p>
        <PrivacyNote className="tools__privacy" />
      </div>
    </aside>
  );
}
