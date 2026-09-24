import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from '../components/Notice';
import { Toolbar } from '../components/Toolbar';
import { ToolPanel, type AddKind } from '../components/ToolPanel';
import { useFileDrop } from '../components/useFileDrop';
import { Welcome } from '../components/Welcome';
import { detectPage } from '../features/forms/detectForm';
import { EmptyFieldsDialog } from '../features/forms/EmptyFieldsDialog';
import { fetchFieldFontBytes, useFieldFont } from '../features/forms/fieldFont';
import { fieldDomId, fieldElementId, FieldLayer } from '../features/forms/FieldLayer';
import { readForm, type FormInfo } from '../features/forms/readForm';
import { SignatureDialog, type CreatedSignature } from '../features/signature/SignatureDialog';
import { SignatureLayer, signatureDomId } from '../features/signature/SignatureLayer';
import { useSignatureAssets } from '../features/signature/useSignatureAssets';
import { openPdf, type LoadedPdf } from '../features/viewer/pdfjs';
import { Thumbnails } from '../features/viewer/Thumbnails';
import { pageElementId, Viewer } from '../features/viewer/Viewer';
import { fitWidthZoom, zoomIn, zoomOut } from '../features/viewer/zoom';
import { t } from '../i18n';
import { detectedToFields } from '../lib/detection/toFields';
import { formatDateIT } from '../lib/forms/date';
import { sortReadingOrder } from '../lib/forms/readingOrder';
import {
  countAnswerable,
  countEmpty,
  isAnswerable,
  isChanged,
  isEmptyValue,
  type FieldValue,
  type FormField,
  type FormValues,
} from '../lib/forms/types';
import { displaySize, pdfToScreenRect, screenToPdfRect, type PdfRect } from '../lib/pdf/coords';
import { buildOutputFileName } from '../lib/pdf/fileName';
import { classifyLoadError } from '../lib/pdf/loadErrors';
import { PdfSaveError } from '../lib/pdf/saveErrors';
import { defaultPlacement, fitInto } from '../lib/signature/placement';
import type { PlacedSignature } from '../lib/signature/types';
import { saveFile } from '../platform/saveFile';
import { useEditHistory } from './useEditHistory';

interface OpenDocument {
  id: number;
  name: string;
  /** Original bytes, never modified. */
  bytes: Uint8Array;
  pdf: LoadedPdf;
  form: FormInfo;
}

type ZoomState = { mode: 'fit' } | { mode: 'manual'; value: number };
type Message = { text: string; tone: 'error' | 'info' };

export function App() {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [status, setStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomState, setZoomState] = useState<ZoomState>({ mode: 'fit' });
  const [viewerWidth, setViewerWidth] = useState(0);
  /** What the document already contained (AcroForm values, text read in prefilled cells). */
  const [initialValues, setInitialValues] = useState<FormValues>({});
  const [flatten, setFlatten] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('text');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  /** Open "Crea la tua firma" dialog; `fieldId` = the signature field that asked for it. */
  const [signatureRequest, setSignatureRequest] = useState<{ fieldId?: string } | null>(null);
  const [withDate, setWithDate] = useState(false);
  const fontReady = useFieldFont();
  const edit = useEditHistory();
  const { fields, values, signatures } = edit.state;
  const { change, patch, reset, endGesture, undo, redo } = edit;
  const signatureAssets = useSignatureAssets();

  // Running numbers for "Campo N" labels and ids of fields and signatures added by hand.
  const labelCounter = useRef(0);
  const manualCounter = useRef(0);
  const signatureCounter = useRef(0);
  /** Element to focus once it has been rendered (a field or signature just added). */
  const pendingFocus = useRef<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  // Guards against a slow file finishing after a newer one was chosen.
  const openRequest = useRef(0);
  const docRef = useRef<OpenDocument | null>(null);

  const widestPage = doc ? Math.max(...doc.pdf.pages.map((p) => p.width)) : 0;
  const zoom = zoomState.mode === 'fit' ? fitWidthZoom(viewerWidth, widestPage) : zoomState.value;

  const geometryOf = useCallback((index: number) => docRef.current!.pdf.pages[index]!.geometry, []);
  /** Flat documents (no AcroForm): fields are detected and can be added by clicking. */
  const flatDocument = !!doc && doc.form.fields.length === 0 && doc.form.xfa !== 'pure';
  const fieldsByPage = useMemo(() => groupByPage(fields), [fields]);
  const signaturesByPage = useMemo(() => groupByPage(signatures), [signatures]);
  const signedFieldIds = useMemo(() => new Set(signatures.map((s) => s.fieldId).filter(Boolean) as string[]), [signatures]);
  const emptyCount = countEmpty(fields, values);
  /**
   * On flat documents the fields are only guesses: they matter once the user
   * starts filling them in. A plain PDF with a decorative box is just downloaded.
   */
  const startedFilling = fields.some((f) => isChanged(f, values, initialValues));
  const formInUse = fields.length > 0 && (!flatDocument || startedFilling || !flatten);
  const signatureDate = withDate ? formatDateIT(new Date()) : null;

  // ---------------------------------------------------------------------------
  // Opening and field detection

  /** Looks for places to fill, page by page, while the document is already usable. */
  const detectFields = useCallback(
    async (target: OpenDocument) => {
      setDetecting(true);
      let scannedNoticeShown = false;
      for (let index = 0; index < target.pdf.pages.length; index++) {
        if (docRef.current !== target) return;
        try {
          const geometry = target.pdf.pages[index]!.geometry;
          const result = await detectPage(target.pdf.proxy, index, geometry);
          if (docRef.current !== target) return;
          const found = detectedToFields(index, result.detected, geometry, () => t.forms.genericLabel(++labelCounter.current));
          if (found.fields.length || Object.keys(found.values).length) {
            // Not a user action: added to every undo step.
            patch((s) => ({
              ...s,
              fields: sortReadingOrder([...s.fields, ...found.fields], geometryOf),
              values: { ...found.values, ...s.values },
            }));
            setInitialValues((previous) => ({ ...previous, ...found.values }));
          }
          if (result.scanned && !scannedNoticeShown) {
            scannedNoticeShown = true;
            setMessage({ text: t.forms.scanned, tone: 'info' });
          }
        } catch (error) {
          console.error(`Field detection failed on page ${index + 1}`, error);
        }
      }
      if (docRef.current === target) setDetecting(false);
    },
    [geometryOf, patch],
  );

  const openFile = useCallback(
    async (file: File) => {
      const request = ++openRequest.current;
      setOpening(true);
      setMessage(null);
      setStatus('');
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdf = await openPdf(bytes);
        let form: FormInfo;
        try {
          form = await readForm(
            pdf.proxy,
            pdf.pages.map((p) => p.geometry),
          );
        } catch (error) {
          await pdf.close();
          throw error;
        }
        if (request !== openRequest.current) {
          await pdf.close();
          return;
        }
        void docRef.current?.pdf.close();
        const next = { id: request, name: file.name, bytes, pdf, form };
        docRef.current = next;
        setDoc(next);
        reset({ fields: form.fields, values: form.initialValues, signatures: [] });
        setInitialValues(form.initialValues);
        setFlatten(true);
        setEditing(false);
        setSelectedId(null);
        setSelectedSignatureId(null);
        labelCounter.current = 0;
        manualCounter.current = 0;
        setCurrentPage(1);
        setZoomState({ mode: 'fit' });
        viewerRef.current?.scrollTo({ top: 0 });
        if (form.xfa === 'pure') setMessage({ text: t.forms.xfaPure, tone: 'info' });
        else if (!form.fields.length) void detectFields(next);
      } catch (err) {
        if (request !== openRequest.current) return;
        const code = classifyLoadError(err);
        if (code === 'unknown') console.error(err);
        setMessage({ text: t.loadErrors[code], tone: 'error' });
      } finally {
        if (request === openRequest.current) setOpening(false);
      }
    },
    [detectFields, reset],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files.find((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf') ?? files[0];
      if (file) void openFile(file);
    },
    [openFile],
  );

  const dragging = useFileDrop(handleFiles);

  // ---------------------------------------------------------------------------
  // Fields

  const setFieldValue = useCallback(
    (valueKey: string, value: FieldValue) => {
      change((s) => ({ ...s, values: { ...s.values, [valueKey]: value } }), `value:${valueKey}`);
    },
    [change],
  );

  const addFieldAt = useCallback(
    (pageIndex: number, x: number, y: number) => {
      const geometry = geometryOf(pageIndex);
      const page = displaySize(geometry, 1);
      const tool: AddKind = editing ? addKind : 'text';
      const kind = tool === 'checkbox' ? 'checkbox' : 'text';
      const width = kind === 'checkbox' ? 12 : Math.min(200, page.width - 8);
      const height = kind === 'checkbox' ? 12 : 18;
      const left = Math.max(4, Math.min(kind === 'checkbox' ? x - width / 2 : x, page.width - width - 4));
      const top = Math.max(4, Math.min(y - height / 2, page.height - height - 4));
      const id = `man-${++manualCounter.current}`;
      const field: FormField = {
        id,
        valueKey: id,
        pageIndex,
        rect: screenToPdfRect({ left, top, width, height }, geometry, 1),
        kind,
        label: tool === 'cover' ? t.forms.coverLabel(++labelCounter.current) : t.forms.genericLabel(++labelCounter.current),
        source: 'manual',
        orientation: 'display',
        cover: tool === 'cover' || undefined,
      };
      change((s) => ({ ...s, fields: sortReadingOrder([...s.fields, field], geometryOf) }));
      if (editing) setSelectedId(id);
      else pendingFocus.current = fieldDomId(id);
    },
    [editing, addKind, geometryOf, change],
  );

  const moveField = useCallback(
    (id: string, rect: PdfRect) => {
      change((s) => ({ ...s, fields: s.fields.map((f) => (f.id === id ? { ...f, rect } : f)) }), `field:${id}`);
    },
    [change],
  );

  const removeField = useCallback(
    (id: string) => {
      change((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== id) }));
      setSelectedId((current) => (current === id ? null : current));
    },
    [change],
  );

  const toggleEditing = useCallback(() => {
    // Fields may have moved: restore the reading (Tab) order when done.
    if (editing) patch((s) => ({ ...s, fields: sortReadingOrder(s.fields, geometryOf) }));
    setEditing(!editing);
    setSelectedId(null);
  }, [editing, geometryOf, patch]);

  // ---------------------------------------------------------------------------
  // Signatures

  /**
   * Puts a signature on the document: into the given signature field, else
   * into the first signature field still empty, else in the middle of the
   * page being read.
   */
  const placeSignature = useCallback(
    (assetId: string, aspect: number, fieldId?: string) => {
      const current = docRef.current;
      if (!current) return;
      const field =
        fields.find((f) => f.id === fieldId) ??
        fields.find((f) => f.kind === 'signature' && !signedFieldIds.has(f.id));
      let pageIndex: number;
      let rect: PdfRect;
      if (field) {
        const geometry = geometryOf(field.pageIndex);
        pageIndex = field.pageIndex;
        rect = screenToPdfRect(fitInto(pdfToScreenRect(field.rect, geometry, 1), aspect, 1), geometry, 1);
      } else {
        pageIndex = Math.min(currentPage, current.pdf.pages.length) - 1;
        const geometry = geometryOf(pageIndex);
        rect = screenToPdfRect(defaultPlacement(displaySize(geometry, 1), aspect), geometry, 1);
      }
      const id = `sig-${++signatureCounter.current}`;
      const signature: PlacedSignature = { id, assetId, pageIndex, rect, fieldId: field?.id };
      change((s) => ({ ...s, signatures: [...s.signatures, signature] }));
      setSelectedSignatureId(id);
      pendingFocus.current = signatureDomId(id);
    },
    [fields, signedFieldIds, currentPage, geometryOf, change],
  );

  /** "Aggiungi firma" / "Firma qui": uses the current signature, or asks to create one. */
  const requestSignature = useCallback(
    (fieldId?: string) => {
      const entry = signatureAssets.currentId ? signatureAssets.assets[signatureAssets.currentId] : undefined;
      if (entry) placeSignature(entry.asset.id, entry.asset.aspect, fieldId);
      else setSignatureRequest({ fieldId });
    },
    [signatureAssets, placeSignature],
  );

  const onSignatureCreated = useCallback(
    (created: CreatedSignature) => {
      const id = signatureAssets.create(created.png, created.aspect, created.source, created.remember);
      placeSignature(id, created.aspect, signatureRequest?.fieldId);
      setSignatureRequest(null);
    },
    [signatureAssets, placeSignature, signatureRequest],
  );

  const moveSignature = useCallback(
    (id: string, rect: PdfRect) => {
      change(
        (s) => ({ ...s, signatures: s.signatures.map((sig) => (sig.id === id ? { ...sig, rect } : sig)) }),
        `signature:${id}`,
      );
    },
    [change],
  );

  const removeSignature = useCallback(
    (id: string) => {
      change((s) => ({ ...s, signatures: s.signatures.filter((sig) => sig.id !== id) }));
      setSelectedSignatureId(null);
    },
    [change],
  );

  // Focus what was just added (this also scrolls it into view).
  useEffect(() => {
    if (!pendingFocus.current) return;
    const element = document.getElementById(pendingFocus.current);
    pendingFocus.current = null;
    element?.focus();
  }, [fields, signatures]);

  // Ctrl+Z / Ctrl+Y (and Cmd on Mac); Ctrl+Shift+Z also redoes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !doc) return;
      if (document.querySelector('dialog[open]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, undo, redo]);

  // ---------------------------------------------------------------------------
  // Download

  const download = useCallback(async () => {
    if (!doc) return;
    setSaving(true);
    setMessage(null);
    setStatus('');
    try {
      // pdf-lib is loaded only when needed, from the app's own origin.
      const { savePdf } = await import('../lib/pdf/save');
      const geometries = doc.pdf.pages.map((p) => p.geometry);
      const signed = signatures.length > 0;
      const needsFont = formInUse || (signed && !!signatureDate);
      const images: Record<string, Uint8Array> = {};
      for (const s of signatures) {
        const entry = signatureAssets.assets[s.assetId];
        if (entry) images[s.assetId] = entry.asset.png;
      }
      const output = await savePdf(doc.bytes, {
        form: formInUse ? { fields, values, initialValues, flatten, geometries } : undefined,
        signatures: signed
          ? {
              placed: signatures,
              images,
              geometries,
              date: signatureDate,
              signedFieldNames: signatures
                .map((s) => fields.find((f) => f.id === s.fieldId))
                .filter((f): f is FormField => !!f && f.source === 'acroform' && !!f.acroName)
                .map((f) => f.acroName!),
            }
          : undefined,
        fontBytes: needsFont ? await fetchFieldFontBytes() : undefined,
      });
      const name = buildOutputFileName(doc.name, signed ? 'signed' : 'modified');
      saveFile(output, name);
      setStatus(t.status.downloaded(name));
    } catch (err) {
      const code = err instanceof PdfSaveError ? err.code : 'unknown';
      if (code === 'unknown') console.error(err);
      const text =
        err instanceof PdfSaveError && code === 'unsupported-characters'
          ? t.unsupportedCharacters(err.characters)
          : t.saveErrors[code];
      setMessage({ text, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }, [doc, fields, values, initialValues, flatten, formInUse, signatures, signatureAssets, signatureDate]);

  const requestDownload = useCallback(() => {
    if (formInUse && emptyCount > 0) setConfirmEmpty(true);
    else void download();
  }, [formInUse, emptyCount, download]);

  const backToForm = useCallback(() => {
    setConfirmEmpty(false);
    const firstEmpty = fields.find((f) => isAnswerable(f) && isEmptyValue(values[f.valueKey]));
    if (firstEmpty) document.getElementById(fieldElementId(firstEmpty))?.focus();
  }, [fields, values]);

  const goToPage = useCallback((page: number) => {
    document.getElementById(pageElementId(page))?.scrollIntoView({ block: 'start' });
    setCurrentPage(page);
  }, []);

  useEffect(() => {
    document.title = doc ? `${doc.name} — ${t.app.name}` : t.app.documentTitle;
  }, [doc]);

  const signatureImages = useMemo(() => {
    const images: Record<string, { url: string; aspect: number }> = {};
    for (const [id, entry] of Object.entries(signatureAssets.assets)) images[id] = { url: entry.url, aspect: entry.asset.aspect };
    return images;
  }, [signatureAssets.assets]);

  const renderOverlay = useCallback(
    (pageIndex: number, scale: number) => {
      if (!doc) return null;
      const geometry = doc.pdf.pages[pageIndex]!.geometry;
      return (
        <>
          <FieldLayer
            fields={fieldsByPage.get(pageIndex) ?? []}
            geometry={geometry}
            scale={scale}
            values={values}
            onChange={setFieldValue}
            fontReady={fontReady}
            editing={editing}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRectChange={moveField}
            onRemove={removeField}
            onAddAt={flatDocument ? (x, y) => addFieldAt(pageIndex, x, y) : undefined}
            onLeaveEmpty={(field) => removeField(field.id)}
            onGestureEnd={endGesture}
            signedFieldIds={signedFieldIds}
            onSignField={requestSignature}
          />
          <SignatureLayer
            signatures={signaturesByPage.get(pageIndex) ?? []}
            images={signatureImages}
            geometry={geometry}
            scale={scale}
            pageNumber={pageIndex + 1}
            date={signatureDate}
            selectedId={selectedSignatureId}
            onSelect={setSelectedSignatureId}
            onRectChange={moveSignature}
            onRemove={removeSignature}
            onGestureEnd={endGesture}
          />
        </>
      );
    },
    [
      doc,
      fieldsByPage,
      signaturesByPage,
      flatDocument,
      values,
      setFieldValue,
      fontReady,
      editing,
      selectedId,
      moveField,
      removeField,
      addFieldAt,
      endGesture,
      signedFieldIds,
      requestSignature,
      signatureImages,
      signatureDate,
      selectedSignatureId,
      moveSignature,
      removeSignature,
    ],
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf,.pdf"
      hidden
      data-testid="file-input"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = ''; // allow re-opening the same file
        if (file) void openFile(file);
      }}
    />
  );
  const openPicker = () => fileInputRef.current?.click();
  const currentAsset = signatureAssets.currentId ? signatureAssets.assets[signatureAssets.currentId] : undefined;
  const savedAsset = signatureAssets.savedId ? signatureAssets.assets[signatureAssets.savedId] : undefined;

  return (
    <>
      {fileInput}
      {message && <Notice message={message.text} tone={message.tone} onDismiss={() => setMessage(null)} />}

      {doc ? (
        <div className="app">
          <Toolbar
            fileName={doc.name}
            currentPage={currentPage}
            pageCount={doc.pdf.pages.length}
            zoom={zoom}
            fitWidth={zoomState.mode === 'fit'}
            onZoomIn={() => setZoomState({ mode: 'manual', value: zoomIn(zoom) })}
            onZoomOut={() => setZoomState({ mode: 'manual', value: zoomOut(zoom) })}
            onFitWidth={() => setZoomState({ mode: 'fit' })}
            onOpenClick={openPicker}
            canUndo={edit.canUndo}
            canRedo={edit.canRedo}
            onUndo={undo}
            onRedo={redo}
          />
          <div className="workspace">
            <Thumbnails key={doc.id} doc={doc.pdf} currentPage={currentPage} onSelect={goToPage} />
            <main className="workspace__main">
              <Viewer
                key={doc.id}
                doc={doc.pdf}
                zoom={zoom}
                scrollRef={viewerRef}
                onCurrentPageChange={setCurrentPage}
                onWidthChange={setViewerWidth}
                renderOverlay={renderOverlay}
              />
            </main>
            <ToolPanel
              pageCount={doc.pdf.pages.length}
              form={{
                total: countAnswerable(fields),
                empty: emptyCount,
                flatten,
                xfa: doc.form.xfa,
                covers: fields.some((f) => f.cover),
                onFlattenChange: setFlatten,
                detection: flatDocument
                  ? {
                      running: detecting,
                      found: fields.filter((f) => f.source === 'detected' && !f.cover).length,
                      prefilled: fields.filter((f) => f.source === 'detected' && f.cover).length,
                      editing,
                      addKind,
                      onToggleEditing: toggleEditing,
                      onAddKindChange: setAddKind,
                    }
                  : null,
              }}
              signature={{
                count: signatures.length,
                currentUrl: currentAsset?.url ?? null,
                withDate,
                onAdd: () => requestSignature(),
                onNew: () => setSignatureRequest({}),
                onWithDateChange: setWithDate,
              }}
              saving={saving}
              status={status}
              onDownload={requestDownload}
            />
          </div>
        </div>
      ) : (
        <Welcome busy={opening} onOpenClick={openPicker} />
      )}

      {confirmEmpty && (
        <EmptyFieldsDialog
          emptyCount={emptyCount}
          onCancel={backToForm}
          onConfirm={() => {
            setConfirmEmpty(false);
            void download();
          }}
        />
      )}

      {signatureRequest && (
        <SignatureDialog
          savedPreviewUrl={savedAsset?.url ?? null}
          onUseSaved={() => {
            if (!savedAsset) return;
            signatureAssets.setCurrentId(savedAsset.asset.id);
            placeSignature(savedAsset.asset.id, savedAsset.asset.aspect, signatureRequest.fieldId);
            setSignatureRequest(null);
          }}
          onDeleteSaved={() => {
            void signatureAssets.forgetSaved().then((ok) => ok && setStatus(t.signature.deleted));
          }}
          onCreate={onSignatureCreated}
          onClose={() => setSignatureRequest(null)}
        />
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <p>{t.welcome.dropOverlay}</p>
        </div>
      )}
    </>
  );
}

function groupByPage<T extends { pageIndex: number }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) map.set(item.pageIndex, [...(map.get(item.pageIndex) ?? []), item]);
  return map;
}
