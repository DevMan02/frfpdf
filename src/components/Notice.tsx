import { t } from '../i18n';
import { Icon } from './Icon';

interface NoticeProps {
  message: string;
  onDismiss: () => void;
}

/** Error banner, announced immediately by screen readers. */
export function Notice({ message, onDismiss }: NoticeProps) {
  return (
    <div className="notice" role="alert">
      <p>{message}</p>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label={t.common.close}>
        <Icon name="close" />
      </button>
    </div>
  );
}
