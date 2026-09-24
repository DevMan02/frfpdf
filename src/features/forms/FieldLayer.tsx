import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { t } from '../../i18n';
import { formatDateIT } from '../../lib/forms/date';
import { isEmptyValue, type FieldValue, type FormField, type FormValues } from '../../lib/forms/types';
import {
  displaySize,
  normalizeRotation,
  pdfToScreenRect,
  screenToPdfRect,
  type PageGeometry,
  type PdfRect,
  type ScreenRect,
} from '../../lib/pdf/coords';
import { DEFAULT_PADDING, fitFontSize } from '../../lib/pdf/fitText';
import { FIELD_FONT_STACK, measureFieldText } from './fieldFont';

export const fieldDomId = (id: string) => `campo-${id}`;
export const fieldElementId = (field: FormField) => fieldDomId(field.id);
export const EDIT_HELP_ID = 'field-edit-help';

/** Smallest size a field can be resized to, in points. */
const MIN_SIZE = 6;

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
  /** "Modifica campi": fields can be moved, resized and deleted. */
  editing: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRectChange: (id: string, rect: PdfRect) => void;
  onRemove: (id: string) => void;
  /** Click on an empty spot of the page: point in display points (scale 1). Flat documents only. */
  onAddAt?: (x: number, y: number) => void;
  /** A field added by hand was left empty. */
  onLeaveEmpty?: (field: FormField) => void;
}

/** Editable fields positioned over a rendered page. */
export function FieldLayer(props: FieldLayerProps) {
  const { fields, geometry, scale, editing, onAddAt } = props;
  if (!fields.length && !onAddAt) return null;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onAddAt || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onAddAt((event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale);
  };

  return (
    <div
      className={`field-layer${onAddAt ? ' field-layer--add' : ''}${editing ? ' field-layer--editing' : ''}`}
      onClick={handleClick}
    >
      {fields.map((field) =>
        editing && field.source !== 'acroform' ? (
          <EditableBox key={field.id} field={field} rect={screenRect(field, geometry, scale)} {...props} />
        ) : (
          <FieldBox
            key={field.id}
            field={field}
            style={boxStyle(field, geometry, scale)}
            size={boxSize(field, geometry)}
            scale={scale}
            value={props.values[field.valueKey]}
            onChange={(value) => props.onChange(field.valueKey, value)}
            onLeaveEmpty={props.onLeaveEmpty}
          />
        ),
      )}
    </div>
  );
}

function screenRect(field: FormField, geometry: PageGeometry, scale: number): ScreenRect {
  return pdfToScreenRect(field.rect, geometry, scale);
}

/** Field size in points along its text direction. */
function boxSize(field: FormField, geometry: PageGeometry): { width: number; height: number } {
  if (field.orientation === 'display') {
    const r = pdfToScreenRect(field.rect, geometry, 1);
    return { width: r.width, height: r.height };
  }
  return { width: field.rect[2] - field.rect[0], height: field.rect[3] - field.rect[1] };
}

/**
 * Position on screen. AcroForm fields turn with the page (like in every PDF
 * reader); detected and hand-made fields stay upright.
 */
function boxStyle(field: FormField, geometry: PageGeometry, scale: number): CSSProperties {
  const screen = screenRect(field, geometry, scale);
  const rotation = normalizeRotation(geometry.rotation);
  if (field.orientation === 'display' || rotation === 0) {
    return { left: screen.left, top: screen.top, width: screen.width, height: screen.height };
  }
  const width = (field.rect[2] - field.rect[0]) * scale;
  const height = (field.rect[3] - field.rect[1]) * scale;
  return {
    left: screen.left + screen.width / 2 - width / 2,
    top: screen.top + screen.height / 2 - height / 2,
    width,
    height,
    transform: `rotate(${rotation}deg)`,
  };
}

// ---------------------------------------------------------------------------
// Filling

interface FieldBoxProps {
  field: FormField;
  style: CSSProperties;
  size: { width: number; height: number };
  scale: number;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  onLeaveEmpty?: (field: FormField) => void;
}

function FieldBox({ field, style, size, scale, value, onChange, onLeaveEmpty }: FieldBoxProps) {
  const id = fieldElementId(field);
  const text = typeof value === 'string' ? value : '';
  const fontSize =
    fitFontSize(text, measureFieldText, {
      width: size.width,
      height: size.height,
      multiline: field.kind === 'multiline',
      maxSize: field.fontSize && field.fontSize > 0 ? Math.min(field.fontSize, 12) : undefined,
    }) * scale;
  const textStyle: CSSProperties = {
    fontSize,
    fontFamily: FIELD_FONT_STACK,
    padding: `0 ${DEFAULT_PADDING * scale}px`,
  };
  const onBlur = () => {
    if (field.source === 'manual' && isEmptyValue(value)) onLeaveEmpty?.(field);
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
            onBlur={onBlur}
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
            onBlur={onBlur}
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
            onBlur={onBlur}
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
          <span style={{ fontSize: Math.min(12 * scale, size.height * scale * 0.4) }}>{t.forms.signatureHere}</span>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Editing ("Modifica campi")

interface EditableBoxProps extends FieldLayerProps {
  field: FormField;
  rect: ScreenRect;
}

function EditableBox({ field, rect, geometry, scale, selectedId, onSelect, onRectChange, onRemove }: EditableBoxProps) {
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; start: ScreenRect } | null>(null);
  const page = displaySize(geometry, scale);
  const selected = selectedId === field.id;

  const commit = (next: ScreenRect) => {
    const min = MIN_SIZE * scale;
    const width = Math.min(Math.max(min, next.width), page.width);
    const height = Math.min(Math.max(min, next.height), page.height);
    const left = Math.min(Math.max(0, next.left), page.width - width);
    const top = Math.min(Math.max(0, next.top), page.height - height);
    onRectChange(field.id, screenToPdfRect({ left, top, width, height }, geometry, scale));
  };

  function startDrag(event: PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(field.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, start: rect };
    (event.currentTarget.closest('.field') as HTMLElement | null)?.focus();
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (d.mode === 'move') commit({ ...d.start, left: d.start.left + dx, top: d.start.top + dy });
    else commit({ ...d.start, width: d.start.width + dx, height: d.start.height + dy });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (event.shiftKey ? 10 : 1) * scale;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = arrows[event.key];
    if (move) {
      event.preventDefault();
      if (event.altKey) commit({ ...rect, width: rect.width + move[0], height: rect.height + move[1] });
      else commit({ ...rect, left: rect.left + move[0], top: rect.top + move[1] });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(field.id);
    } else if (event.key === 'Escape') {
      onSelect(null);
      (event.currentTarget as HTMLElement).blur();
    }
  };

  return (
    <div
      id={fieldElementId(field)}
      className={`field field--edit field--edit-${field.kind}${selected ? ' is-selected' : ''}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      role="button"
      tabIndex={0}
      aria-label={t.forms.editFieldLabel(field.label, t.forms.kinds[field.kind])}
      aria-describedby={EDIT_HELP_ID}
      aria-pressed={selected}
      onFocus={() => onSelect(field.id)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => startDrag(event, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="field__edit-name" aria-hidden="true">
        {field.label}
      </span>
      <button
        type="button"
        className="field__remove"
        aria-label={t.forms.removeField(field.label)}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(field.id);
        }}
      >
        ×
      </button>
      <span
        className="field__resize"
        aria-hidden="true"
        onPointerDown={(event) => startDrag(event, 'resize')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
