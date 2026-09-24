import { useState } from 'react';
import { t } from '../i18n';
import { EDIT_HELP_ID } from '../features/forms/FieldLayer';
import type { XfaStatus } from '../features/forms/readForm';
import { Icon } from './Icon';
import { PrivacyNote } from './PrivacyNote';

export type AddKind = 'text' | 'checkbox';

/** Flat documents: fields found automatically, editable by the user. */
export interface DetectionSummary {
  running: boolean;
  found: number;
  editing: boolean;
  addKind: AddKind;
  onToggleEditing: () => void;
  onAddKindChange: (kind: AddKind) => void;
}

export interface FormSummary {
  total: number;
  empty: number;
  flatten: boolean;
  xfa: XfaStatus;
  onFlattenChange: (flatten: boolean) => void;
  /** Present for documents without real form fields. */
  detection: DetectionSummary | null;
}

interface ToolPanelProps {
  pageCount: number;
  form: FormSummary | null;
  saving: boolean;
  status: string;
  onDownload: () => void;
}

/** Right-hand panel on desktop, bottom bar on mobile. */
export function ToolPanel({ pageCount, form, saving, status, onDownload }: ToolPanelProps) {
  // Mobile only: the options are folded away in the bottom bar.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const detection = form?.detection ?? null;
  const hasOptions = !!form && (form.total > 0 || form.xfa !== 'none' || !!detection);

  return (
    <aside className="tools" aria-label={t.tools.title}>
      {hasOptions && (
        <button
          type="button"
          className="button button--quiet tools__toggle"
          aria-expanded={optionsOpen}
          aria-controls="tools-body"
          onClick={() => setOptionsOpen((open) => !open)}
        >
          {t.tools.options}
        </button>
      )}
      <div id="tools-body" className={`tools__body${optionsOpen ? ' tools__body--open' : ''}`}>
        <p className="tools__meta">{t.viewer.pageCount(pageCount)}</p>

        {form && hasOptions && (
          <section className="tools__section" aria-labelledby="tools-form-title">
            <h2 id="tools-form-title" className="tools__heading">
              {t.forms.title}
            </h2>

            {detection && (
              <p className="tools__hint" aria-live="polite">
                {detection.running
                  ? t.forms.detecting
                  : detection.found > 0
                    ? t.forms.detected(detection.found)
                    : t.forms.noneDetected}
              </p>
            )}

            {form.total > 0 && (
              <p className="tools__progress" aria-live="polite">
                {t.forms.summary(form.total, form.empty)}
              </p>
            )}

            {detection && (
              <>
                {!detection.editing && <p className="tools__hint">{t.forms.clickToWrite}</p>}
                <button
                  type="button"
                  className="button button--quiet tools__edit"
                  aria-pressed={detection.editing}
                  onClick={detection.onToggleEditing}
                >
                  {detection.editing ? t.forms.editDone : t.forms.editFields}
                </button>
                {detection.editing && (
                  <>
                    <fieldset className="segmented">
                      <legend>{t.forms.addKind}</legend>
                      {(['text', 'checkbox'] as const).map((kind) => (
                        <label key={kind}>
                          <input
                            type="radio"
                            name="add-kind"
                            checked={detection.addKind === kind}
                            onChange={() => detection.onAddKindChange(kind)}
                          />
                          <span>{kind === 'text' ? t.forms.addText : t.forms.addCheckbox}</span>
                        </label>
                      ))}
                    </fieldset>
                    <p id={EDIT_HELP_ID} className="tools__hint">
                      {t.forms.editHelp}
                    </p>
                  </>
                )}
              </>
            )}

            {form.total > 0 && (
              <>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={form.flatten}
                    onChange={(e) => form.onFlattenChange(e.target.checked)}
                  />
                  <span>{t.forms.flatten}</span>
                </label>
                <p className="tools__hint">
                  {form.flatten ? t.forms.flattenOn : detection ? t.forms.flattenOffFlat : t.forms.flattenOff}
                </p>
              </>
            )}

            {form.xfa !== 'none' && (
              <p className="tools__hint">{form.xfa === 'pure' ? t.forms.xfaPure : t.forms.xfaHybrid}</p>
            )}
          </section>
        )}
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
