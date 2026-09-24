# CLAUDE.md — FrFPDF (Free for Real PDF)

## Nome del progetto

- Nome: **FrFPDF**, sigla di **Free for Real PDF**.
- Usa sempre il nome insieme al sottotitolo nei punti principali (titolo della pagina, schermata iniziale, manifest della PWA, README), così il significato della sigla è chiaro.
- Nome del repository e percorso su GitHub Pages: `frfpdf`.
- Nel manifest PWA: `name` = "FrFPDF — Free for Real PDF", `short_name` = "FrFPDF".

## Obiettivo del progetto

Uno strumento gratuito e open source per **compilare moduli PDF, firmarli e gestirne le pagine**, in alternativa ad Adobe Acrobat e ai servizi online a pagamento.

Deve funzionare in due modi, con **un solo codice**:
1. **Web app pubblica** su GitHub Pages, usabile da chiunque con un link.
2. **App installabile** sul PC (PWA), utilizzabile anche offline.

## Regola fondamentale: il file non esce mai dal dispositivo

Questo è il requisito più importante e prevale su qualsiasi altra scelta.

- Tutta l'elaborazione avviene nel browser, lato client. **Nessun backend, nessun server, nessun upload.**
- Nessuna chiamata di rete durante l'uso: niente analytics, niente telemetria, niente CDN esterne, niente font caricati da Google Fonts a runtime.
- Tutte le risorse (worker di pdf.js, font, icone) devono essere incluse nel bundle e servite dallo stesso dominio.
- Aggiungi in `index.html` una Content Security Policy restrittiva, ad esempio: `default-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'`.
- Prima di aggiungere qualunque dipendenza, verifica che non effettui chiamate di rete. **Chiedi conferma prima di installare nuove dipendenze** oltre a quelle elencate qui sotto.
- Nell'interfaccia deve essere visibile una breve nota: "I tuoi file restano sul tuo dispositivo: nulla viene caricato online."

## Stack tecnico

- **Vite + TypeScript** (strict mode).
- **React** per l'interfaccia.
- **pdf.js** (`pdfjs-dist`) per visualizzare le pagine e leggere la posizione dei campi dei moduli. Il worker va importato localmente, non da CDN.
- **pdf-lib** per scrivere i PDF: compilazione dei campi, inserimento delle firme, gestione delle pagine.
- **signature_pad** per la firma disegnata.
- **vite-plugin-pwa** per la parte installabile e offline.
- **Vitest** per i test della logica, **Playwright** per i test end-to-end.

Motivazione: una web app in TypeScript permette di avere sito e app installabile con lo stesso codice. Python nel browser richiederebbe Pyodide (download pesante e avvio lento), quindi non è stato scelto.

## Lingua

- Interfaccia utente in **italiano**, con i testi raccolti in un unico file (`src/i18n/it.ts`) per poter aggiungere altre lingue in futuro.
- Codice, nomi di variabili e commenti in **inglese**.

## Funzionalità della prima versione (MVP)

### 1. Apertura e visualizzazione
- Apertura del PDF tramite pulsante o trascinamento nella pagina.
- Visualizzazione di tutte le pagine con zoom (adatta alla larghezza, +/−) e miniature laterali.
- Errori chiari per file protetti da password, file danneggiati o file che non sono PDF.

### 2. Compilazione dei moduli e riconoscimento dei campi

Quando si apre un PDF, l'app deve cercare da sola i punti da compilare. Esistono tre tipi di PDF e vanno gestiti tutti.

**Caso A — PDF con campi veri (AcroForm)**
- Rilevamento automatico di testo, checkbox, radio, menu a tendina e campi firma.
- I campi compaiono subito modificabili sopra la pagina, nella posizione corretta.
- Se il modulo ha un campo firma, "Aggiungi firma" propone di posizionarla direttamente lì.
- I moduli XFA non sono supportati: mostra un messaggio che lo spiega.

**Caso B — PDF "piatto" con spazi da riempire (senza campi veri)**
È il caso più comune: moduli creati in Word ed esportati in PDF, con righe e caselle solo disegnate.
- Analizza ogni pagina con pdf.js: testo con coordinate (`getTextContent`) e grafica (`getOperatorList`) per trovare:
  - sequenze di `____` o `.....` → campo di testo;
  - linee orizzontali disegnate sotto o accanto a un'etichetta → campo di testo;
  - rettangoli vuoti piccoli e quadrati, oppure caratteri come ☐ → checkbox;
  - rettangoli vuoti più grandi → campo di testo multilinea;
  - celle vuote di tabelle → campo di testo.
- Usa l'etichetta più vicina (a sinistra o sopra) come nome del campo e per indovinarne il tipo: "Data" → campo data con pulsante "Oggi"; "Firma" → area firma; "Nome", "Cognome", "Codice fiscale", "Email" → campo di testo.
- Mostra i campi trovati evidenziati sulla pagina. L'utente può compilarli, eliminare quelli sbagliati, ridimensionarli e aggiungerne di nuovi con un clic nel punto desiderato.
- La dimensione del carattere si adatta all'altezza del campo; il testo non deve uscire dal riquadro.
- Opzione extra: "Salva come modulo compilabile", che trasforma i campi riconosciuti in veri campi AcroForm con pdf-lib, così il PDF diventa compilabile anche in altri programmi.
- Mantieni la logica di riconoscimento in `lib/detection/`, come funzioni pure testate su PDF di esempio.

**Caso C — PDF scansionato (le pagine sono immagini)**
- Rileva che la pagina è un'immagine senza testo e mostra: "Documento scansionato: clicca dove vuoi scrivere."
- In una fase successiva: riconoscimento automatico di righe e caselle analizzando l'immagine su canvas, e riconoscimento delle etichette con OCR (Tesseract.js, con i dati della lingua italiana inclusi nel bundle per funzionare offline). Chiedi conferma prima di aggiungerlo, perché aumenta di diversi MB il peso dell'app.

**Per tutti i casi**
- Navigazione tra i campi con Tab e Maiusc+Tab, nell'ordine di lettura della pagina.
- Contatore dei campi ancora vuoti prima del salvataggio ("3 campi non compilati: vuoi scaricare comunque?").
- Opzione al salvataggio: "Blocca i campi compilati" (flatten), attiva di default.

### 3. Firma
Tre modi per creare la firma, tutti convertiti in un'immagine PNG con sfondo trasparente:
- **Disegnata**: con mouse, touchpad o dito (signature_pad), con scelta del colore (nero o blu) e pulsante "Cancella".
- **Da immagine**: caricamento di una foto o scansione della firma (PNG/JPG), con rimozione automatica dello sfondo bianco tramite soglia regolabile.
- **Scritta**: l'utente inserisce **nome e cognome** e sceglie tra 3–4 stili calligrafici. I font devono avere licenza OFL, essere inclusi nel progetto in `public/fonts/` e la firma viene disegnata su canvas e poi esportata in PNG.

Posizionamento:
- La firma si trascina sulla pagina, si ridimensiona mantenendo le proporzioni e si elimina.
- Si possono inserire più firme e su più pagine.
- Opzione per aggiungere accanto la data del giorno.
- La conversione dalle coordinate dello schermo a quelle del PDF (origine in basso a sinistra, punti tipografici) deve tenere conto di zoom e rotazione della pagina. Scrivi test dedicati per questa funzione.

Memoria della firma:
- Opzione facoltativa "Ricorda la mia firma su questo dispositivo", disattivata di default, salvata in IndexedDB, con pulsante per eliminarla.

Avviso legale, sempre visibile nel pannello firma:
- "Questa è una firma grafica. Non sostituisce la firma digitale qualificata richiesta per alcuni documenti ufficiali."

### 4. Gestione delle pagine
- **Ruotare** una o più pagine di 90°.
- **Eliminare** pagine.
- **Riordinare** le pagine trascinando le miniature.
- **Unire** più PDF in uno solo, scegliendo l'ordine dei file.
- **Dividere** un PDF: per intervalli (es. "1-3, 5, 8-10") oppure una pagina per file. Più file in uscita si scaricano uno alla volta o in un unico ZIP (JSZip, lato client).

### 5. Salvataggio
- Pulsante "Scarica PDF" che genera il file con il nome originale seguito da `_firmato` o `_modificato`.
- Nessuna modifica al file originale.
- Annulla / Ripeti (almeno per firme e operazioni sulle pagine).

### 6. Blocco del documento dopo la firma

Obiettivo: un PDF firmato non deve essere modificabile con facilità e, al livello più alto, ogni modifica deve essere rilevabile. Nessuna tecnica rende un file impossibile da modificare, quindi l'interfaccia non deve mai promettere "impossibile da modificare". Deve descrivere onestamente cosa fa ogni livello.

**Livello 1 — Appiattimento (sempre attivo se il PDF contiene una firma)**
- Campi dei moduli, testi aggiunti, data e firme vengono fusi nel contenuto della pagina (flatten). Non restano campi o oggetti spostabili.
- Se il documento contiene almeno una firma, l'opzione "Blocca i campi compilati" è forzata e non disattivabile.

**Livello 2 — Protezione con permessi (attiva di default dopo la firma, disattivabile)**
- Il PDF viene cifrato (AES-256) con una password proprietario e **senza** password di apertura: chiunque può aprirlo, leggerlo e stamparlo, ma i lettori PDF che rispettano i permessi bloccano modifica, compilazione, aggiunta di annotazioni ed estrazione di pagine.
- Di default la password proprietario è casuale e non viene mostrata. Opzione "Imposta una password per poterlo modificare in futuro", che la fa scegliere all'utente.
- pdf-lib non gestisce la cifratura: valuta una libreria che funzioni interamente nel browser, per esempio qpdf compilato in WebAssembly. Deve essere inclusa nel bundle, funzionare offline e avere licenza compatibile. Chiedi conferma prima di aggiungerla.
- Nota nell'interfaccia: "I permessi vengono rispettati dai principali lettori PDF, ma un utente esperto può rimuoverli."

**Livello 3 — Sigillo di integrità (facoltativo, fase separata)**
- Firma crittografica PAdES con certificato autofirmato generato nel browser e conservato solo sul dispositivo (IndexedDB, con possibilità di esportarlo in .p12 protetto da password).
- Firma di certificazione con DocMDP "nessuna modifica consentita": se il file viene alterato, Adobe Reader segnala che il documento è stato modificato dopo la firma.
- Valuta librerie che girano nel browser (ad esempio @signpdf con node-forge), sempre senza chiamate di rete.
- Il sigillo va applicato come **ultimo passaggio**, dopo appiattimento e rotazioni. Verifica la compatibilità con il livello 2; se combinarli risulta troppo fragile, rendi le due opzioni alternative e spiega la scelta.
- Nota nell'interfaccia: "Il sigillo rende visibile qualsiasi modifica successiva. Il certificato è creato da te, quindi Adobe lo segnalerà come 'identità non verificata': non è una firma digitale qualificata."

Nel pannello di salvataggio mostra i tre livelli con una frase ciascuna, in linguaggio semplice.

## Web app e app installabile

- Deploy automatico su **GitHub Pages** tramite GitHub Actions a ogni push su `main`. Imposta correttamente `base` in `vite.config.ts` con il nome del repository.
- **PWA**: manifest con nome, icone e colori; service worker che mette in cache tutte le risorse (worker pdf.js e font compresi) così l'app funziona senza connessione dopo la prima apertura.
- Nel manifest aggiungi `file_handlers` per i file `.pdf`, così l'app installata può aprire i PDF direttamente dal sistema (dove il browser lo supporta).
- Nell'interfaccia, un pulsante "Installa app" che compare solo quando l'installazione è disponibile.

## Design

- Interfaccia sobria, pensata per un'operazione rapida: apri, compila, firma, scarica.
- Layout: miniature a sinistra, documento al centro, pannello strumenti a destra (su mobile gli strumenti diventano una barra in basso).
- Testi brevi, in forma attiva, con etichette che dicono cosa succede: "Aggiungi firma", "Scarica PDF", "Ruota pagina".
- Evita l'aspetto da template generico. Scegli una palette di 4–6 colori e un carattere tipografico con motivazione precisa, legati al tema carta/firma/documento.
- Requisiti minimi: responsive fino al mobile, focus da tastiera visibile, contrasto accessibile, rispetto di `prefers-reduced-motion`, tema chiaro e scuro.

## Struttura consigliata

```
src/
  app/            # layout, routing tra le modalità
  components/     # componenti UI
  features/
    viewer/       # rendering con pdf.js
    forms/        # rilevamento e compilazione campi
    signature/    # creazione, memoria e posizionamento firme
    pages/        # ruota, elimina, riordina, unisci, dividi
  lib/pdf/        # funzioni pure su pdf-lib (testabili senza UI)
  lib/detection/  # riconoscimento dei campi nei PDF piatti e scansionati
  i18n/
public/fonts/     # font calligrafici OFL per la firma scritta
tests/
  fixtures/       # PDF di prova: modulo AcroForm, modulo piatto con righe ____ e caselle, modulo con tabella,
                  # modulo scansionato, PDF semplice, PDF con pagine ruotate, PDF protetto
```

## Fasi di sviluppo

Procedi una fase alla volta. Alla fine di ogni fase: test che passano, commit, breve riepilogo di cosa è stato fatto.

1. Setup del progetto, visualizzazione del PDF e salvataggio senza modifiche.
2. Compilazione dei moduli: caso A (campi veri) e caso B (PDF piatti con riconoscimento automatico).
3. Firma (disegnata, da immagine, scritta) e posizionamento.
4. Blocco dopo la firma: livello 1 (appiattimento) e livello 2 (permessi).
5. Gestione delle pagine.
6. PWA, deploy su GitHub Pages e README.
7. Sigillo di integrità (livello 3).
8. Riconoscimento automatico nei PDF scansionati (caso C, con OCR).

**Non implementare ora:** l'app desktop con installer (.exe, .dmg, Linux) è uno sviluppo futuro. Va solo descritta nel README come release futura (vedi sotto). Nel frattempo evita scelte che la renderebbero difficile: tieni la logica PDF separata dall'interfaccia in `lib/`, e isola in un modulo a parte il codice specifico della PWA (service worker, installazione, `file_handlers`), perché nell'app desktop sarà sostituito.

## Criteri di completamento

- Con gli strumenti di sviluppo del browser, la scheda Rete non mostra richieste esterne durante l'uso.
- L'app installata funziona con il Wi-Fi spento.
- Un PDF compilato e firmato si apre correttamente in Adobe Reader, nel visualizzatore di Chrome e in quello di Firefox, con i campi e le firme nella posizione giusta.
- Le funzioni in `lib/pdf/` hanno test unitari; il flusso "apri → compila → firma → scarica" ha un test end-to-end.
- Sui PDF di prova piatti, `lib/detection/` trova le righe `____`, le linee disegnate e le caselle, con test che verificano posizione e tipo di ogni campo atteso.
- Un PDF firmato non contiene più campi modificabili (verificalo nei test rileggendolo con pdf-lib).
- Con il livello 2 attivo, il PDF si apre senza password in Adobe Reader, Chrome e Firefox, e Adobe Reader mostra la modifica come non consentita.
- Con il livello 3 attivo, modificando il file dopo la firma Adobe Reader segnala che il documento è stato alterato.

## Documentazione e licenza

- Licenza del progetto: **MIT**. Verifica che le licenze delle dipendenze siano compatibili (pdf.js Apache 2.0, pdf-lib MIT, signature_pad MIT, font OFL).
- `README.md` in italiano con: cosa fa l'app, link alla versione online, come installarla come app, come avviarla in locale, nota sulla privacy, nota sulla differenza tra firma grafica e firma digitale qualificata, e spiegazione onesta di cosa proteggono (e cosa non proteggono) i tre livelli di blocco.
- Nel README includi una sezione **"Release future"** con:
  - **App desktop scaricabile** (installer .exe/.msi per Windows, .dmg per Mac, pacchetto per Linux), costruita con Tauri a partire dallo stesso codice e pubblicata automaticamente su GitHub Releases. Funzionerà senza browser e anche per chi usa Firefox. Specifica che, senza un certificato di firma del codice, Windows e Mac potranno mostrare un avviso di sicurezza al primo avvio.
  - Riconoscimento automatico dei campi nei PDF scansionati, se non ancora completato.
- Nel README spiega anche come installare la versione attuale come app (PWA) su Chrome ed Edge, con i passaggi e una nota su Firefox.
- Nel README, subito sotto il titolo e prima di ogni altra sezione, inserisci una sezione **"Privacy: i tuoi file restano sul tuo dispositivo"** che dica chiaramente:
  - **I file non vengono mai inviati a un server esterno.** Apertura, compilazione, firma, blocco e gestione delle pagine avvengono interamente nel browser (o nell'app installata), sul dispositivo dell'utente.
  - FrFPDF non ha un backend, non usa analytics, cookie di tracciamento o telemetria, e non carica risorse da CDN esterne.
  - La firma salvata (se l'utente sceglie di ricordarla) e l'eventuale certificato del sigillo restano solo nel browser del dispositivo e si possono eliminare in qualsiasi momento.
  - Per trasparenza: GitHub Pages fornisce i file dell'app come per qualsiasi sito web, quindi GitHub può registrare la visita alla pagina. I documenti invece non lasciano mai il dispositivo.
  - Come verificarlo da soli: aprire gli strumenti per sviluppatori (F12) → scheda "Rete", usare l'app e controllare che durante l'elaborazione non partano richieste; oppure installare l'app, spegnere il Wi-Fi e vedere che tutto funziona lo stesso. Il codice è pubblico e controllabile nel repository.
- Riporta la stessa frase ("I tuoi file non vengono mai inviati a un server esterno") anche nella descrizione breve del repository GitHub e nella schermata iniziale dell'app.
