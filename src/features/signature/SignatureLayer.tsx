import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '../../i18n';
import { displaySize, pdfToScreenRect, screenToPdfRect, type PageGeometry, type PdfRect, type ScreenRect } from '../../lib/pdf/coords';
import { dateBox } from '../../lib/pdf/signatures';
import { clampToPage, resizeKeepingAspect } from '../../lib/signature/placement';
import type { PlacedSignature } from '../../lib/signature/types';

export const SIGNATURE_HELP_ID = 'signature-help';
export const signatureDomId = (id: string) => `firma-${id}`;

/** Smallest signature width, in points. */
const MIN_WIDTH = 24;

interface SignatureLayerProps {
  signatures: PlacedSignature[];
  /** Object URL and aspect ratio of each signature image. */
  images: Record<string, { url: string; aspect: number }>;
  geometry: PageGeometry;
  scale: number;
  pageNumber: number;
  /** Date shown next to every signature, or null. */
  date: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRectChange: (id: string, rect: PdfRect) => void;
  onRemove: (id: string) => void;
  /** End of a drag or of keyboard moves: closes the undo step. */
  onGestureEnd: () => void;
}

/** Signatures placed on one page: movable, resizable (keeping proportions), removable. */
export function SignatureLayer(props: SignatureLayerProps) {
  if (!props.signatures.length) return null;
  return (
    <div className="signature-layer">
      {props.signatures.map((signature) => (
        <SignatureBox key={signature.id} signature={signature} {...props} />
      ))}
    </div>
  );
}

function SignatureBox({
  signature,
  images,
  geometry,
  scale,
  pageNumber,
  date,
  selectedId,
  onSelect,
  onRectChange,
  onRemove,
  onGestureEnd,
}: SignatureLayerProps & { signature: PlacedSignature }) {
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; start: ScreenRect } | null>(null);
  const image = images[signature.assetId];
  const rect = pdfToScreenRect(signature.rect, geometry, scale);
  const page = displaySize(geometry, scale);
  const selected = selectedId === signature.id;
  const aspect = image?.aspect ?? rect.width / rect.height;

  const commit = (next: ScreenRect) => onRectChange(signature.id, screenToPdfRect(clampToPage(next, page), geometry, scale));

  function startDrag(event: PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(signature.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, start: rect };
    (event.currentTarget.closest('.signature') as HTMLElement | null)?.focus();
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (d.mode === 'move') commit({ ...d.start, left: d.start.left + dx, top: d.start.top + dy });
    else commit(resizeKeepingAspect(d.start, dx, aspect, MIN_WIDTH * scale));
  }

  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    onGestureEnd();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
      if (event.altKey) commit(resizeKeepingAspect(rect, move[0] - move[1], aspect, MIN_WIDTH * scale));
      else commit({ ...rect, left: rect.left + move[0], top: rect.top + move[1] });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(signature.id);
    } else if (event.key === 'Escape') {
      onSelect(null);
      event.currentTarget.blur();
    }
  }

  const d = date ? dateBox({ left: 0, top: 0, width: rect.width / scale, height: rect.height / scale }) : null;

  return (
    <div
      id={signatureDomId(signature.id)}
      className={`signature${selected ? ' is-selected' : ''}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      role="button"
      tabIndex={0}
      aria-label={t.signature.placedLabel(pageNumber)}
      aria-describedby={SIGNATURE_HELP_ID}
      aria-pressed={selected}
      onFocus={() => onSelect(signature.id)}
      onBlur={onGestureEnd}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => startDrag(event, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {image && <img src={image.url} alt="" draggable={false} className="signature__image" />}
      {d && (
        <span
          className="signature__date"
          style={{ left: d.left * scale, top: (d.baseline - d.size * 0.8) * scale, fontSize: d.size * scale }}
        >
          {date}
        </span>
      )}
      <button
        type="button"
        className="field__remove"
        aria-label={t.signature.remove}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(signature.id);
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
