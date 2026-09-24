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
    options: 'Opzioni',
    originalUntouched: 'Il file originale non viene modificato: scarichi sempre una copia.',
  },
  forms: {
    title: 'Modulo',
    summary: (total: number, empty: number) =>
      empty === 0
        ? total === 1
          ? 'Il campo è compilato.'
          : `Tutti i ${total} campi sono compilati.`
        : `${empty} ${empty === 1 ? 'campo da compilare' : 'campi da compilare'} su ${total}.`,
    flatten: 'Blocca i campi compilati',
    flattenOn: 'I valori diventano parte della pagina e non si possono più modificare.',
    flattenOff: 'I campi restano compilabili, anche in altri programmi.',
    flattenOffFlat: 'I campi diventano veri campi compilabili, anche in altri programmi.',
    detecting: 'Ricerca degli spazi da compilare…',
    detected: (n: number) =>
      n === 1
        ? 'Trovato 1 spazio da compilare: controllalo prima di scaricare.'
        : `Trovati ${n} spazi da compilare: controllali prima di scaricare.`,
    noneDetected: 'Nessuno spazio da compilare trovato automaticamente.',
    detectedPrefilled: (n: number) =>
      n === 1
        ? '1 campo è già compilato: per correggerlo, scrivici sopra.'
        : `${n} campi sono già compilati: per correggerli, scrivici sopra.`,
    coverNote:
      'Le correzioni coprono il contenuto originale con un riquadro bianco. Il vecchio contenuto resta nel file sotto il riquadro: non si vede, ma chi usa programmi di modifica PDF può recuperarlo.',
    clickToWrite: 'Clicca sulla pagina dove vuoi scrivere.',
    scanned: 'Documento scansionato: clicca dove vuoi scrivere.',
    editFields: 'Modifica campi',
    editDone: 'Fine modifiche',
    addKind: 'Al clic sulla pagina aggiungi',
    addText: 'Testo',
    addCheckbox: 'Casella',
    addCover: 'Sostituisci',
    editHelp:
      'Trascina un campo per spostarlo e l’angolo per ridimensionarlo. Da tastiera: frecce per spostare, Alt+frecce per ridimensionare, Canc per eliminare. «Sostituisci» crea un campo sopra un testo già scritto, per correggerlo.',
    editFieldLabel: (label: string, kind: string) => `${label}, ${kind}`,
    removeField: (label: string) => `Elimina ${label}`,
    genericLabel: (n: number) => `Campo ${n}`,
    coverLabel: (n: number) => `Correzione ${n}`,
    kinds: {
      text: 'campo di testo',
      multiline: 'testo su più righe',
      date: 'data',
      checkbox: 'casella',
      radio: 'scelta',
      dropdown: 'menu',
      signature: 'firma',
    },
    today: 'Oggi',
    todayFor: (label: string) => `Inserisci la data di oggi: ${label}`,
    datePlaceholder: 'gg/mm/aaaa',
    choose: '—',
    signatureHere: 'Firma',
    emptyWarning: (n: number) =>
      n === 1 ? '1 campo non compilato: vuoi scaricare comunque?' : `${n} campi non compilati: vuoi scaricare comunque?`,
    downloadAnyway: 'Scarica comunque',
    backToForm: 'Torna al modulo',
    xfaHybrid:
      'Questo modulo contiene anche una versione XFA. FrFPDF usa i campi standard e la toglie dal file scaricato, così i valori si vedono in ogni programma.',
    xfaPure:
      'Questo modulo usa il formato XFA, che FrFPDF non supporta: i campi non si possono compilare. Aprilo con Adobe Acrobat Reader oppure chiedi a chi te l’ha inviato una versione PDF standard.',
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
    'unsupported-characters': 'Alcuni caratteri inseriti non si possono salvare nel PDF.',
    unknown: 'Non è stato possibile creare il PDF da scaricare.',
  } satisfies Record<SaveErrorCode, string>,
  unsupportedCharacters: (chars: string[]) =>
    `Questi caratteri non si possono salvare nel PDF: ${chars.join(' ')}. Sostituiscili (per esempio con la lettera senza accento) e riprova.`,
  common: {
    close: 'Chiudi',
  },
};

export type Strings = typeof it;
