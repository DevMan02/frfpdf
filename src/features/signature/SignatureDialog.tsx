import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import SignaturePad from 'signature_pad';
import { t } from '../../i18n';
import { suggestThreshold, type RgbaImage } from '../../lib/signature/image';
import {
  drawImage,
  imageWithoutBackground,
  readCanvas,
  readImageFile,
  renderTypedSignature,
  toSignaturePng,
  type SignaturePng,
} from './canvasImage';
import { loadSignatureFonts, SIGNATURE_FONTS } from './fonts';

type Tab = 'draw' | 'image' | 'type';
type Color = 'black' | 'blue';

const COLORS: Record<Color, string> = { black: '#1b1b1f', blue: '#1f3a8a' };

export interface CreatedSignature extends SignaturePng {
  source: 'drawn' | 'image' | 'typed';
  remember: boolean;
}

interface SignatureDialogProps {
  /** A signature remembered on this device, offered first. */
  savedPreviewUrl: string | null;
  onUseSaved: () => void;
  onDeleteSaved: () => void;
  onCreate: (signature: CreatedSignature) => void;
  onClose: () => void;
}

/** "Crea la tua firma": draw it, upload a photo of it, or type it. */
export function SignatureDialog({ savedPreviewUrl, onUseSaved, onDeleteSaved, onCreate, onClose }: SignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [color, setColor] = useState<Color>('black');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Each tab registers how to export its current signature (null = nothing yet).
  const exporter = useRef<() => RgbaImage | null>(() => null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    void loadSignatureFonts();
  }, []);

  const register = useCallback((fn: () => RgbaImage | null, hasContent: boolean) => {
    exporter.current = fn;
    setReady(hasContent);
  }, []);

  const confirm = async () => {
    const image = exporter.current();
    if (!image) return;
    setBusy(true);
    const png = await toSignaturePng(image);
    setBusy(false);
    if (!png) {
      setError(t.signature.empty);
      return;
    }
    dialogRef.current?.close();
    onCreate({ ...png, source: tab === 'draw' ? 'drawn' : tab === 'image' ? 'image' : 'typed', remember });
  };

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  const tabs: Tab[] = ['draw', 'image', 'type'];
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length]!;
    setTab(target);
    document.getElementById(`signature-tab-${target}`)?.focus();
  };

  return (
    <dialog ref={dialogRef} className="dialog signature-dialog" aria-labelledby="signature-title" onCancel={onClose}>
      <h2 id="signature-title" className="dialog__title">
        {t.signature.dialogTitle}
      </h2>

      {savedPreviewUrl && (
        <div className="signature-saved">
          <p className="signature-saved__label">{t.signature.saved}</p>
          <img src={savedPreviewUrl} alt="" className="signature-saved__image" />
          <div className="signature-saved__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                dialogRef.current?.close();
                onUseSaved();
              }}
            >
              {t.signature.useSaved}
            </button>
            <button type="button" className="button button--quiet" onClick={onDeleteSaved}>
              {t.signature.deleteSaved}
            </button>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label={t.signature.dialogTitle}>
        {tabs.map((id) => (
          <button
            key={id}
            id={`signature-tab-${id}`}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={tab === id}
            aria-controls={`signature-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={onTabKey}
          >
            {t.signature.tabs[id]}
          </button>
        ))}
      </div>

      {tab !== 'image' && (
        <fieldset className="segmented signature-color">
          <legend>{t.signature.color}</legend>
          {(['black', 'blue'] as const).map((c) => (
            <label key={c}>
              <input type="radio" name="signature-color" checked={color === c} onChange={() => setColor(c)} />
              <span>
                <span className="signature-color__swatch" style={{ background: COLORS[c] }} aria-hidden="true" />
                {c === 'black' ? t.signature.black : t.signature.blue}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div id={`signature-panel-${tab}`} role="tabpanel" aria-labelledby={`signature-tab-${tab}`} className="signature-panel">
        {tab === 'draw' && <DrawPanel color={COLORS[color]} register={register} />}
        {tab === 'image' && <ImagePanel register={register} />}
        {tab === 'type' && <TypePanel color={COLORS[color]} register={register} />}
      </div>

      {error && (
        <p className="signature-error" role="alert">
          {error}
        </p>
      )}

      <label className="switch">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>{t.signature.remember}</span>
      </label>
      <p className="tools__hint">{t.signature.rememberHint}</p>

      <p className="signature-legal">{t.signature.legal}</p>

      <div className="dialog__actions">
        <button type="button" className="button button--quiet" onClick={close}>
          {t.signature.cancel}
        </button>
        <button type="button" className="button button--primary" disabled={!ready || busy} onClick={() => void confirm()}>
          {t.signature.use}
        </button>
      </div>
    </dialog>
  );
}

type Register = (fn: () => RgbaImage | null, hasContent: boolean) => void;

// ---------------------------------------------------------------------------

function DrawPanel({ color, register }: { color: string; register: Register }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const pad = new SignaturePad(canvas, { penColor: color, minWidth: 0.8, maxWidth: 2.8 });
    padRef.current = pad;

    // Sharp on high-density screens; keeps the strokes when the size changes.
    const resize = () => {
      const data = pad.toData();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')!.scale(ratio, ratio);
      pad.fromData(data);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onEnd = () => setHasInk(!pad.isEmpty());
    pad.addEventListener('endStroke', onEnd);
    return () => {
      observer.disconnect();
      pad.removeEventListener('endStroke', onEnd);
      pad.off();
    };
    // The pad is created once; colour changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    pad.penColor = color;
    // Recolour what is already drawn.
    pad.fromData(pad.toData().map((group) => ({ ...group, penColor: color })));
  }, [color]);

  useEffect(() => {
    register(() => (padRef.current && !padRef.current.isEmpty() ? readCanvas(canvasRef.current!) : null), hasInk);
  }, [hasInk, register]);

  return (
    <>
      <p className="tools__hint">{t.signature.drawHint}</p>
      <canvas ref={canvasRef} className="signature-pad" aria-label={t.signature.drawArea} role="img" />
      <button
        type="button"
        className="button button--quiet"
        onClick={() => {
          padRef.current?.clear();
          setHasInk(false);
        }}
      >
        {t.signature.clear}
      </button>
    </>
  );
}

function ImagePanel({ register }: { register: Register }) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [threshold, setThreshold] = useState(200);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!source || !previewRef.current) return;
    drawImage(imageWithoutBackground(source, threshold), previewRef.current);
  }, [source, threshold]);

  useEffect(() => {
    register(() => (source ? imageWithoutBackground(source, threshold) : null), !!source);
  }, [source, threshold, register]);

  return (
    <>
      <label className="button button--quiet signature-file">
        {t.signature.chooseImage}
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="visually-hidden"
          data-testid="signature-image-input"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              const image = await readImageFile(file);
              setThreshold(suggestThreshold(image));
              setSource(image);
              setError('');
            } catch {
              setError(t.signature.imageError);
            }
          }}
        />
      </label>
      <p className="tools__hint">{t.signature.imageHint}</p>
      {error && <p role="alert">{error}</p>}
      {source && (
        <>
          <canvas ref={previewRef} className="signature-preview" role="img" aria-label={t.signature.imagePreview} />
          <label className="signature-slider">
            <span>{t.signature.threshold}</span>
            <span className="signature-slider__row">
              <span aria-hidden="true">{t.signature.thresholdLess}</span>
              <input
                type="range"
                min={80}
                max={250}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
              <span aria-hidden="true">{t.signature.thresholdMore}</span>
            </span>
          </label>
        </>
      )}
    </>
  );
}

function TypePanel({ color, register }: { color: string; register: Register }) {
  const [name, setName] = useState('');
  const [fontId, setFontId] = useState(SIGNATURE_FONTS[0]!.id);
  const font = SIGNATURE_FONTS.find((f) => f.id === fontId)!;

  useEffect(() => {
    const text = name.trim();
    register(() => (text ? renderTypedSignature(text, font.family, color) : null), !!text);
  }, [name, font, color, register]);

  return (
    <>
      <label className="text-input">
        <span>{t.signature.nameLabel}</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <fieldset className="signature-styles">
        <legend>{t.signature.style}</legend>
        {SIGNATURE_FONTS.map((f) => (
          <label key={f.id} className="signature-style">
            <input type="radio" name="signature-style" checked={fontId === f.id} onChange={() => setFontId(f.id)} />
            <span className="signature-style__preview" style={{ fontFamily: `"${f.family}", cursive`, color }}>
              {name.trim() || 'Mario Rossi'}
            </span>
            <span className="signature-style__name">{t.signature.styles[f.id]}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
