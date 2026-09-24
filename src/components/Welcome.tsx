import { t } from '../i18n';
import { Icon } from './Icon';

interface WelcomeProps {
  busy: boolean;
  onOpenClick: () => void;
}

/** First screen: the drop target is drawn as a "sign here" line on a sheet. */
export function Welcome({ busy, onOpenClick }: WelcomeProps) {
  return (
    <main className="welcome">
      <header className="welcome__header">
        <h1 className="welcome__title">
          {t.app.name}
          <span className="welcome__tagline">{t.app.tagline}</span>
        </h1>
        <p className="welcome__lead">{t.welcome.lead}</p>
      </header>

      <div className="welcome__sheet">
        <div className="sign-line">
          <span className="sign-line__mark" aria-hidden="true">
            ✕
          </span>
          <span className="sign-line__rule" aria-hidden="true" />
          <span className="sign-line__label">{busy ? t.status.opening : t.welcome.dropLine}</span>
        </div>
        <p className="welcome__or">{t.welcome.or}</p>
        <button type="button" className="button button--primary" onClick={onOpenClick} disabled={busy}>
          <Icon name="open" />
          {t.welcome.open}
        </button>
      </div>

      <p className="welcome__privacy">
        <Icon name="device" size={20} />
        <strong>{t.privacy.headline}</strong>
      </p>
    </main>
  );
}
