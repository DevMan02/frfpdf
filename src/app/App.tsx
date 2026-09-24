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
import { openPdf, type LoadedPdf } from '../features/viewer/pdfjs';
import { Thumbnails } from '../features/viewer/Thumbnails';
import { pageElementId, Viewer } from '../features/viewer/Viewer';
import { fitWidthZoom, zoomIn, zoomOut } from '../features/viewer/zoom';
import { t } from '../i18n';
import { detectedToFields } from '../lib/detection/toFields';
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
import { displaySize, screenToPdfRect, type PdfRect } from '../lib/pdf/coords';
import { buildOutputFileName } from '../lib/pdf/fileName';
import { classifyLoadError } from '../lib/pdf/loadErrors';
import { PdfSaveError } from '../lib/pdf/saveErrors';
import { saveFile } from '../platform/saveFile';

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
  const [values, setValues] = useState<FormValues>({});
  /** What the document already contained (AcroForm values, text read in prefilled cells). */
  const [initialValues, setInitialValues] = useState<FormValues>({});
  const [flatten, setFlatten] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('text');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fontReady = useFieldFont();
  // Running numbers for "Campo N" labels and ids of fields added by hand.
  const labelCounter = useRef(0);
  const manualCounter = useRef(0);
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
  const fieldsByPage = useMemo(() => {
    const map = new Map<number, FormField[]>();
    for (const f of fields) map.set(f.pageIndex, [...(map.get(f.pageIndex) ?? []), f]);
    return map;
  }, [fields]);
  const emptyCount = countEmpty(fields, values);
  /**
   * On flat documents the fields are only guesses: they matter once the user
   * starts filling them in. A plain PDF with a decorative box is just downloaded.
   */
  const startedFilling = fields.some((f) => isChanged(f, values, initialValues));
  const formInUse = fields.length > 0 && (!flatDocument || startedFilling || !flatten);

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
        if (found.fields.length) setFields((previous) => sortReadingOrder([...previous, ...found.fields], geometryOf));
        if (Object.keys(found.values).length) {
          setInitialValues((previous) => ({ ...previous, ...found.values }));
          setValues((previous) => ({ ...found.values, ...previous }));
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
    [geometryOf],
  );


  const openFile = useCallback(async (file: File) => {
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
      setFields(form.fields);
      setValues(form.initialValues);
      setInitialValues(form.initialValues);
      setFlatten(true);
      setEditing(false);
      setSelectedId(null);
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
  }, [detectFields]);

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
      setFields((previous) => sortReadingOrder([...previous, field], geometryOf));
      if (editing) setSelectedId(id);
      else pendingFocus.current = id;
    },
    [editing, addKind, geometryOf],
  );

  const moveField = useCallback((id: string, rect: PdfRect) => {
    setFields((previous) => previous.map((f) => (f.id === id ? { ...f, rect } : f)));
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((previous) => previous.filter((f) => f.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const toggleEditing = useCallback(() => {
    // Fields may have moved: restore the reading (Tab) order when done.
    if (editing) setFields((previous) => sortReadingOrder(previous, geometryOf));
    setEditing(!editing);
    setSelectedId(null);
  }, [editing, geometryOf]);

  // Focus a field just added by clicking on the page.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const element = document.getElementById(fieldDomId(pendingFocus.current));
    pendingFocus.current = null;
    element?.focus();
  }, [fields]);

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files.find((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf') ?? files[0];
      if (file) void openFile(file);
    },
    [openFile],
  );

  const dragging = useFileDrop(handleFiles);

  const setFieldValue = useCallback((valueKey: string, value: FieldValue) => {
    setValues((previous) => ({ ...previous, [valueKey]: value }));
  }, []);

  const download = useCallback(async () => {
    if (!doc) return;
    setSaving(true);
    setMessage(null);
    setStatus('');
    try {
      // pdf-lib is loaded only when needed, from the app's own origin.
      const { savePdf } = await import('../lib/pdf/save');
      const output = await savePdf(
        doc.bytes,
        formInUse
          ? {
              form: {
                fields,
                values,
                initialValues,
                flatten,
                geometries: doc.pdf.pages.map((p) => p.geometry),
              },
              fontBytes: await fetchFieldFontBytes(),
            }
          : {},
      );
      const name = buildOutputFileName(doc.name, 'modified');
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
  }, [doc, fields, values, initialValues, flatten, formInUse]);

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

  const renderOverlay = useCallback(
    (pageIndex: number, scale: number) => {
      const pageFields = fieldsByPage.get(pageIndex) ?? [];
      if (!doc || (!pageFields.length && !flatDocument)) return null;
      return (
        <FieldLayer
          fields={pageFields}
          geometry={doc.pdf.pages[pageIndex]!.geometry}
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
        />
      );
    },
    [doc, fieldsByPage, flatDocument, values, setFieldValue, fontReady, editing, selectedId, moveField, removeField, addFieldAt],
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
                renderOverlay={fields.length || flatDocument ? renderOverlay : undefined}
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

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <p>{t.welcome.dropOverlay}</p>
        </div>
      )}
    </>
  );
}
