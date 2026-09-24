import { t } from '../i18n';
import { Icon } from './Icon';

interface NoticeProps {
  message: string;
  /** error: something failed. info: something the user should know. */
  tone?: 'error' | 'info';
  onDismiss: () => void;
}

/** Banner at the top of the screen, announced immediately by screen readers. */
export function Notice({ message, tone = 'error', onDismiss }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <p>{message}</p>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label={t.common.close}>
        <Icon name="close" />
      </button>
    </div>
  );
}
