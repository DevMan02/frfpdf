import type { LoadErrorCode } from '../lib/pdf/loadErrors';
import type { SaveErrorCode } from '../lib/pdf/saveErrors';

/** All user-facing Italian strings. Add a sibling file to support another language. */
export const it = {
  app: {
    name: 'FrFPDF',
    tagline: 'Free for Real PDF',
    documentTitle: 'FrFPDF — Free for Real PDF',
  },
  privacy: {
    short: 'I tuoi file restano sul tuo dispositivo: nulla viene caricato online.',
    headline: 'I tuoi file non vengono mai inviati a un server esterno.',
  },
  welcome: {
    lead: 'Compila, firma e sistema i tuoi PDF, gratis e senza registrazione.',
    dropLine: 'Trascina qui il tuo PDF',
    or: 'oppure',
    open: 'Apri PDF',
    dropOverlay: 'Rilascia il file per aprirlo',
  },
  status: {
    opening: 'Apertura del documento…',
    preparing: 'Preparazione del file…',
    downloaded: (name: string) => `Scaricato: ${name}`,
  },
  toolbar: {
    openOther: 'Apri un altro PDF',
    zoomIn: 'Ingrandisci',
    zoomOut: 'Riduci',
    fitWidth: 'Adatta alla larghezza',
    zoomLevel: 'Livello di zoom',
    pageOf: (page: number, total: number) => `Pagina ${page} di ${total}`,
  },
  viewer: {
    pages: 'Pagine',
    document: 'Documento',
    pageLabel: (page: number, total: number) => `Pagina ${page} di ${total}`,
    goToPage: (page: number) => `Vai alla pagina ${page}`,
    pageCount: (n: number) => (n === 1 ? '1 pagina' : `${n} pagine`),
  },
  tools: {
    title: 'Strumenti',
    download: 'Scarica PDF',
    originalUntouched: 'Il file originale non viene modificato: scarichi sempre una copia.',
  },
  loadErrors: {
    'not-pdf': 'Questo file non è un PDF. Scegli un file con estensione .pdf.',
    password:
      'Questo PDF è protetto da password e non si può aprire. Rimuovi la password con il programma che l’ha creato e riprova.',
    corrupted:
      'Il file è danneggiato e non si può aprire. Prova a scaricarlo di nuovo o a riesportarlo dal programma d’origine.',
    empty: 'Il file è vuoto.',
    unknown: 'Non è stato possibile aprire il file.',
  } satisfies Record<LoadErrorCode, string>,
  saveErrors: {
    encrypted:
      'L’autore di questo PDF ne ha bloccato la modifica: puoi leggerlo, ma FrFPDF non può salvarne una copia.',
    unknown: 'Non è stato possibile creare il PDF da scaricare.',
  } satisfies Record<SaveErrorCode, string>,
  common: {
    close: 'Chiudi',
  },
};

export type Strings = typeof it;
