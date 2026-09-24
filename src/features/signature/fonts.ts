/**
 * Calligraphic fonts for the typed signature (SIL OFL, files in
 * public/fonts/, served by the app itself). Each font comes in two files,
 * Latin and Latin Extended, like on Google Fonts.
 */
export interface SignatureFont {
  id: string;
  /** CSS family name used on canvas and in previews. */
  family: string;
  folder: string;
}

export const SIGNATURE_FONTS: SignatureFont[] = [
  { id: 'caveat', family: 'FrFPDF Firma Caveat', folder: 'caveat' },
  { id: 'dancing-script', family: 'FrFPDF Firma Dancing Script', folder: 'dancing-script' },
  { id: 'great-vibes', family: 'FrFPDF Firma Great Vibes', folder: 'great-vibes' },
  { id: 'sacramento', family: 'FrFPDF Firma Sacramento', folder: 'sacramento' },
];

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

let loading: Promise<void> | undefined;

/** Registers and loads the four fonts once. */
export function loadSignatureFonts(): Promise<void> {
  loading ??= Promise.all(
    SIGNATURE_FONTS.flatMap((font) =>
      [
        ['latin', LATIN],
        ['latin-ext', LATIN_EXT],
      ].map(([subset, unicodeRange]) => {
        const url = `${import.meta.env.BASE_URL}fonts/${font.folder}/${font.folder}-${subset}-400-normal.woff2`;
        const face = new FontFace(font.family, `url(${url})`, { unicodeRange });
        document.fonts.add(face);
        return face.load();
      }),
    ),
  )
    .then(() => undefined)
    .catch((error: unknown) => console.warn('Signature fonts not loaded', error));
  return loading;
}
