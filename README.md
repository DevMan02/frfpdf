# FrFPDF — Free for Real PDF

## Privacy: i tuoi file restano sul tuo dispositivo

- **I file non vengono mai inviati a un server esterno.** Apertura, compilazione, firma, blocco e gestione delle pagine avvengono interamente nel browser (o nell'app installata), sul tuo dispositivo.
- FrFPDF non ha un backend, non usa analytics, cookie di tracciamento o telemetria, e non carica risorse da CDN esterne.
- Come verificarlo: apri gli strumenti per sviluppatori (F12) → scheda "Rete", usa l'app e controlla che durante l'elaborazione non partano richieste verso altri siti.

Strumento gratuito e open source per compilare moduli PDF, firmarli e gestirne le pagine.

> Progetto in sviluppo. Stato attuale (fase 3): apertura e visualizzazione dei PDF; compilazione dei moduli con campi veri (AcroForm), dei PDF "piatti" e delle scansioni, con riconoscimento automatico degli spazi da compilare; firma grafica disegnata, da immagine o scritta; annulla/ripeti; download di una copia.
> Il README completo arriverà con la fase 6.

## Avvio in locale

Serve [Node.js](https://nodejs.org/) 22 o superiore.

```bash
npm install
npm run dev
```

Poi apri <http://localhost:5173/frfpdf/>.

## Comandi utili

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | Avvia l'app in modalità sviluppo, con ricarica automatica |
| `npm test` | Esegue i test della logica (Vitest) |
| `npm run test:e2e` | Esegue i test end-to-end nel browser (Playwright) |
| `npm run build` | Crea la versione pubblicabile in `dist/` |
| `npm run preview` | Serve la versione di `dist/` su <http://localhost:4173/frfpdf/> |
| `npm run lint` | Controlla lo stile del codice |
| `npm run fixtures` | Rigenera i PDF di prova in `tests/fixtures/` |

## Licenza

[MIT](LICENSE). Dipendenze principali: pdf.js (Apache 2.0), pdf-lib e @pdf-lib/fontkit (MIT), signature_pad (MIT), font Source Serif 4, IBM Plex Sans, Liberation Sans, Caveat, Dancing Script, Great Vibes e Sacramento (SIL OFL).
