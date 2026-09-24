import type { CSSProperties } from 'react';
import { t } from '../../i18n';
import { formatDateIT } from '../../lib/forms/date';
import type { FieldValue, FormField, FormValues } from '../../lib/forms/types';
import { normalizeRotation, pdfToScreenRect, type PageGeometry } from '../../lib/pdf/coords';
import { DEFAULT_PADDING, fitFontSize } from '../../lib/pdf/fitText';
import { FIELD_FONT_STACK, measureFieldText } from './fieldFont';

export const fieldElementId = (field: FormField) => `campo-${field.id}`;

interface FieldLayerProps {
  /** Fields of this page, already in reading order (= Tab order). */
  fields: FormField[];
  geometry: PageGeometry;
  /** CSS pixels per PDF point. */
  scale: number;
  values: FormValues;
  onChange: (valueKey: string, value: FieldValue) => void;
  /** Changes when the field font finishes loading, to re-measure text. */
  fontReady: boolean;
}

/** Editable fields positioned over a rendered page. */
export function FieldLayer({ fields, geometry, scale, values, onChange }: FieldLayerProps) {
  if (!fields.length) return null;
  return (
    <div className="field-layer">
      {fields.map((field) => (
        <FieldBox
          key={field.id}
          field={field}
          style={boxStyle(field, geometry, scale)}
          scale={scale}
          value={values[field.valueKey]}
          onChange={(value) => onChange(field.valueKey, value)}
        />
      ))}
    </div>
  );
}

/**
 * Position of the field on screen. The box keeps the field's own proportions
 * and is rotated with the page, like the value will be in the saved PDF.
 */
function boxStyle(field: FormField, geometry: PageGeometry, scale: number): CSSProperties {
  const screen = pdfToScreenRect(field.rect, geometry, scale);
  const width = (field.rect[2] - field.rect[0]) * scale;
  const height = (field.rect[3] - field.rect[1]) * scale;
  const rotation = normalizeRotation(geometry.rotation);
  return {
    left: screen.left + screen.width / 2 - width / 2,
    top: screen.top + screen.height / 2 - height / 2,
    width,
    height,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
  };
}

interface FieldBoxProps {
  field: FormField;
  style: CSSProperties;
  scale: number;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
}

function FieldBox({ field, style, scale, value, onChange }: FieldBoxProps) {
  const id = fieldElementId(field);
  const text = typeof value === 'string' ? value : '';
  const [x1, y1, x2, y2] = field.rect;
  const fontSize =
    fitFontSize(text, measureFieldText, {
      width: x2 - x1,
      height: y2 - y1,
      multiline: field.kind === 'multiline',
      maxSize: field.fontSize && field.fontSize > 0 ? Math.min(field.fontSize, 12) : undefined,
    }) * scale;
  const textStyle: CSSProperties = {
    fontSize,
    fontFamily: FIELD_FONT_STACK,
    padding: `0 ${DEFAULT_PADDING * scale}px`,
  };

  switch (field.kind) {
    case 'text':
      return (
        <div className="field" style={style}>
          <input
            id={id}
            type="text"
            className="field__input"
            style={textStyle}
            value={text}
            maxLength={field.maxLength}
            aria-label={field.label}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case 'date':
      return (
        <div className="field field--date" style={style}>
          <input
            id={id}
            type="text"
            className="field__input"
            style={textStyle}
            value={text}
            maxLength={field.maxLength}
            aria-label={field.label}
            placeholder={t.forms.datePlaceholder}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="field__today"
            aria-label={t.forms.todayFor(field.label)}
            onClick={() => onChange(formatDateIT(new Date()))}
          >
            {t.forms.today}
          </button>
        </div>
      );

    case 'multiline':
      return (
        <div className="field" style={style}>
          <textarea
            id={id}
            className="field__input field__input--multiline"
            style={{ ...textStyle, padding: DEFAULT_PADDING * scale, lineHeight: 1.15 }}
            value={text}
            maxLength={field.maxLength}
            aria-label={field.label}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case 'checkbox':
      return (
        <div className="field field--toggle" style={style}>
          <input
            id={id}
            type="checkbox"
            className="field__check"
            checked={value === true}
            disabled={field.readOnly}
            aria-label={field.label}
            onChange={(e) => onChange(e.target.checked)}
          />
        </div>
      );

    case 'radio':
      return (
        <div className="field field--toggle" style={style}>
          <input
            id={id}
            type="radio"
            className="field__check field__check--radio"
            name={`radio-${field.valueKey}`}
            checked={value === field.onValue}
            disabled={field.readOnly}
            aria-label={`${field.label}: ${field.onValue}`}
            onChange={() => onChange(field.onValue ?? '')}
          />
        </div>
      );

    case 'dropdown':
      return (
        <div className="field" style={style}>
          <select
            id={id}
            className="field__input field__select"
            style={textStyle}
            value={text}
            disabled={field.readOnly}
            aria-label={field.label}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{t.forms.choose}</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'signature':
      // Placeholder only: signing arrives in phase 3.
      return (
        <div className="field field--signature" style={style} aria-hidden="true">
          <span style={{ fontSize: Math.min(12 * scale, (y2 - y1) * scale * 0.4) }}>{t.forms.signatureHere}</span>
        </div>
      );
  }
}
