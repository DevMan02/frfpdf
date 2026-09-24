import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from '../components/Notice';
import { Toolbar } from '../components/Toolbar';
import { ToolPanel } from '../components/ToolPanel';
import { useFileDrop } from '../components/useFileDrop';
import { Welcome } from '../components/Welcome';
import { EmptyFieldsDialog } from '../features/forms/EmptyFieldsDialog';
import { fetchFieldFontBytes, useFieldFont } from '../features/forms/fieldFont';
import { fieldElementId, FieldLayer } from '../features/forms/FieldLayer';
import { readForm, type FormInfo } from '../features/forms/readForm';
import { openPdf, type LoadedPdf } from '../features/viewer/pdfjs';
import { Thumbnails } from '../features/viewer/Thumbnails';
import { pageElementId, Viewer } from '../features/viewer/Viewer';
import { fitWidthZoom, zoomIn, zoomOut } from '../features/viewer/zoom';
import { t } from '../i18n';
import {
  countAnswerable,
  countEmpty,
  isAnswerable,
  isEmptyValue,
  type FieldValue,
  type FormField,
  type FormValues,
} from '../lib/forms/types';
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
  const [flatten, setFlatten] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const fontReady = useFieldFont();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  // Guards against a slow file finishing after a newer one was chosen.
  const openRequest = useRef(0);
  const docRef = useRef<OpenDocument | null>(null);

  const widestPage = doc ? Math.max(...doc.pdf.pages.map((p) => p.width)) : 0;
  const zoom = zoomState.mode === 'fit' ? fitWidthZoom(viewerWidth, widestPage) : zoomState.value;

  const fields = useMemo(() => doc?.form.fields ?? [], [doc]);
  const fieldsByPage = useMemo(() => {
    const map = new Map<number, FormField[]>();
    for (const f of fields) map.set(f.pageIndex, [...(map.get(f.pageIndex) ?? []), f]);
    return map;
  }, [fields]);
  const emptyCount = countEmpty(fields, values);

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
      setValues(form.initialValues);
      setFlatten(true);
      setCurrentPage(1);
      setZoomState({ mode: 'fit' });
      viewerRef.current?.scrollTo({ top: 0 });
      if (form.xfa === 'pure') setMessage({ text: t.forms.xfaPure, tone: 'info' });
    } catch (err) {
      if (request !== openRequest.current) return;
      const code = classifyLoadError(err);
      if (code === 'unknown') console.error(err);
      setMessage({ text: t.loadErrors[code], tone: 'error' });
    } finally {
      if (request === openRequest.current) setOpening(false);
    }
  }, []);

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
      const hasForm = doc.form.fields.length > 0;
      const output = await savePdf(
        doc.bytes,
        hasForm
          ? {
              form: { fields: doc.form.fields, values, initialValues: doc.form.initialValues, flatten },
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
  }, [doc, values, flatten]);

  const requestDownload = useCallback(() => {
    if (emptyCount > 0) setConfirmEmpty(true);
    else void download();
  }, [emptyCount, download]);

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
      const pageFields = fieldsByPage.get(pageIndex);
      if (!doc || !pageFields) return null;
      return (
        <FieldLayer
          fields={pageFields}
          geometry={doc.pdf.pages[pageIndex]!.geometry}
          scale={scale}
          values={values}
          onChange={setFieldValue}
          fontReady={fontReady}
        />
      );
    },
    [doc, fieldsByPage, values, setFieldValue, fontReady],
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
                renderOverlay={fields.length ? renderOverlay : undefined}
              />
            </main>
            <ToolPanel
              pageCount={doc.pdf.pages.length}
              form={{
                total: countAnswerable(fields),
                empty: emptyCount,
                flatten,
                xfa: doc.form.xfa,
                onFlattenChange: setFlatten,
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
