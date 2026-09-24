import { t } from '../i18n';
import { Icon } from './Icon';

export function PrivacyNote({ className = '' }: { className?: string }) {
  return (
    <p className={`privacy-note ${className}`}>
      <Icon name="device" size={16} />
      <span>{t.privacy.short}</span>
    </p>
  );
}
