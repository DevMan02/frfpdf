import { useCallback, useEffect, useRef, useState } from 'react';
import { Notice } from '../components/Notice';
import { Toolbar } from '../components/Toolbar';
import { ToolPanel } from '../components/ToolPanel';
import { useFileDrop } from '../components/useFileDrop';
import { Welcome } from '../components/Welcome';
import { openPdf, type LoadedPdf } from '../features/viewer/pdfjs';
import { Thumbnails } from '../features/viewer/Thumbnails';
import { pageElementId, Viewer } from '../features/viewer/Viewer';
import { fitWidthZoom, zoomIn, zoomOut } from '../features/viewer/zoom';
import { t } from '../i18n';
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
}

type ZoomState = { mode: 'fit' } | { mode: 'manual'; value: number };

export function App() {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomState, setZoomState] = useState<ZoomState>({ mode: 'fit' });
  const [viewerWidth, setViewerWidth] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  // Guards against a slow file finishing after a newer one was chosen.
  const openRequest = useRef(0);
  const docRef = useRef<OpenDocument | null>(null);

  const widestPage = doc ? Math.max(...doc.pdf.pages.map((p) => p.width)) : 0;
  const zoom = zoomState.mode === 'fit' ? fitWidthZoom(viewerWidth, widestPage) : zoomState.value;

  const openFile = useCallback(async (file: File) => {
    const request = ++openRequest.current;
    setOpening(true);
    setError(null);
    setStatus('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await openPdf(bytes);
      if (request !== openRequest.current) {
        await pdf.close();
        return;
      }
      void docRef.current?.pdf.close();
      const next = { id: request, name: file.name, bytes, pdf };
      docRef.current = next;
      setDoc(next);
      setCurrentPage(1);
      setZoomState({ mode: 'fit' });
      viewerRef.current?.scrollTo({ top: 0 });
    } catch (err) {
      if (request !== openRequest.current) return;
      const code = classifyLoadError(err);
      if (code === 'unknown') console.error(err);
      setError(t.loadErrors[code]);
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

  const handleDownload = useCallback(async () => {
    if (!doc) return;
    setSaving(true);
    setError(null);
    setStatus('');
    try {
      // pdf-lib is loaded only when needed, from the app's own origin.
      const { savePdf } = await import('../lib/pdf/save');
      const output = await savePdf(doc.bytes);
      const name = buildOutputFileName(doc.name, 'modified');
      saveFile(output, name);
      setStatus(t.status.downloaded(name));
    } catch (err) {
      const code = err instanceof PdfSaveError ? err.code : 'unknown';
      if (code === 'unknown') console.error(err);
      setError(t.saveErrors[code]);
    } finally {
      setSaving(false);
    }
  }, [doc]);

  const goToPage = useCallback((page: number) => {
    document.getElementById(pageElementId(page))?.scrollIntoView({ block: 'start' });
    setCurrentPage(page);
  }, []);

  useEffect(() => {
    document.title = doc ? `${doc.name} — ${t.app.name}` : t.app.documentTitle;
  }, [doc]);

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
      {error && <Notice message={error} onDismiss={() => setError(null)} />}

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
              />
            </main>
            <ToolPanel
              pageCount={doc.pdf.pages.length}
              saving={saving}
              status={status}
              onDownload={() => void handleDownload()}
            />
          </div>
        </div>
      ) : (
        <Welcome busy={opening} onOpenClick={openPicker} />
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <p>{t.welcome.dropOverlay}</p>
        </div>
      )}
    </>
  );
}
