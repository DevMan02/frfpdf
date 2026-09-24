import { useEffect, useRef } from 'react';
import { t } from '../../i18n';

interface EmptyFieldsDialogProps {
  emptyCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "3 campi non compilati: vuoi scaricare comunque?" — a native modal dialog. */
export function EmptyFieldsDialog({ emptyCount, onConfirm, onCancel }: EmptyFieldsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Close first: the browser then restores focus to the download button, and
  // the callback can move it elsewhere (e.g. to the first empty field).
  const closeThen = (callback: () => void) => {
    ref.current?.close();
    callback();
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="empty-fields-title" onCancel={onCancel}>
      <p id="empty-fields-title" className="dialog__title">
        {t.forms.emptyWarning(emptyCount)}
      </p>
      <div className="dialog__actions">
        <button type="button" className="button button--quiet" onClick={() => closeThen(onCancel)}>
          {t.forms.backToForm}
        </button>
        <button type="button" className="button button--primary" onClick={() => closeThen(onConfirm)} autoFocus>
          {t.forms.downloadAnyway}
        </button>
      </div>
    </dialog>
  );
}
