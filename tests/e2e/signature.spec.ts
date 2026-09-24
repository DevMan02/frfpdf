import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const fixture = (name: string) => join(import.meta.dirname, '../fixtures', name);

async function open(page: Page, name: string) {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['blob:', 'data:'].includes(url.protocol) && url.hostname !== 'localhost') external.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(fixture(name));
  await expect(page.locator('.viewer')).toBeVisible();
  return { external, errors };
}

async function download(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica PDF' }).click();
  const confirm = page.getByRole('button', { name: 'Scarica comunque' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const file = await downloadPromise;
  return { name: file.suggestedFilename(), bytes: new Uint8Array(readFileSync(await file.path())) };
}

async function imagesOnPage(bytes: Uint8Array, pageNumber: number) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const ops = await (await doc.getPage(pageNumber)).getOperatorList();
  return ops.fnArray.filter((fn) => fn === OPS.paintImageXObject).length;
}

async function textOf(bytes: Uint8Array, pageNumber: number) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
}

/** Draws a wavy line on the signature pad with the mouse. */
async function drawSignature(page: Page) {
  const box = (await page.locator('.signature-pad').boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + 30 + i * 12, box.y + box.height * (0.6 + 0.25 * Math.sin(i / 2)), { steps: 2 });
  }
  await page.mouse.up();
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Crea la tua firma' });
const todayIT = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

test('draw a signature, place it, move it and download a signed copy', async ({ page }) => {
  const { external, errors } = await open(page, 'simple.pdf');
  await page.getByRole('button', { name: 'Aggiungi firma' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText(/Questa è una firma grafica/)).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Usa questa firma' })).toBeDisabled();

  await drawSignature(page);
  await dialog(page).getByRole('button', { name: 'Usa questa firma' }).click();
  await expect(dialog(page)).toBeHidden();

  const signature = page.getByRole('button', { name: 'Firma a pagina 1' });
  await expect(signature).toBeFocused();
  const before = (await signature.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const after = (await signature.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 50);
  expect(after.y).toBeGreaterThan(before.y + 30);
  expect(after.width).toBeCloseTo(before.width, 0);

  const { name, bytes } = await download(page);
  expect(name).toBe('simple_firmato.pdf');
  expect(await imagesOnPage(bytes, 1)).toBe(1);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('typed signature with the date, placed into the form signature field', async ({ page }) => {
  await open(page, 'acroform.pdf');
  await page.getByRole('button', { name: 'Firma qui: Firma' }).click();
  await dialog(page).getByRole('tab', { name: 'Scrivi' }).click();
  await dialog(page).getByLabel('Nome e cognome').fill('Łukasz Dvořák');
  await dialog(page).getByText('Calligrafico').click();
  await dialog(page).getByRole('button', { name: 'Usa questa firma' }).click();

  const signature = page.locator('#pagina-2 .signature');
  await expect(signature).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Firma qui: Firma' })).toHaveCount(0);

  await page.getByLabel('Aggiungi la data di oggi accanto alla firma').check();
  await expect(signature.locator('.signature__date')).toHaveText(todayIT());

  const { name, bytes } = await download(page);
  expect(name).toBe('acroform_firmato.pdf');
  expect(await imagesOnPage(bytes, 2)).toBe(1);
  expect(await textOf(bytes, 2)).toContain(todayIT());
  const form = (await PDFDocument.load(bytes)).getForm();
  expect(form.getFields().map((f) => f.getName())).not.toContain('firma');
});

test('signature from a photo: the paper becomes transparent', async ({ page }) => {
  await open(page, 'simple.pdf');
  await page.getByRole('button', { name: 'Aggiungi firma' }).click();
  await dialog(page).getByRole('tab', { name: 'Da immagine' }).click();
  await page.getByTestId('signature-image-input').setInputFiles(fixture('signature-photo.png'));
  const preview = dialog(page).getByRole('img', { name: 'Anteprima della firma senza sfondo' });
  await expect(preview).toBeVisible();
  await expect(dialog(page).getByRole('slider')).toBeVisible();

  // Corner = paper: transparent. Middle of the stroke: opaque.
  const alphas = await preview.evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    return [ctx.getImageData(2, 2, 1, 1).data[3], ctx.getImageData(300, 100, 1, 1).data[3]];
  });
  expect(alphas[0]).toBe(0);

  await dialog(page).getByRole('button', { name: 'Usa questa firma' }).click();
  await expect(page.locator('.signature')).toHaveCount(1);
  const { bytes } = await download(page);
  expect(await imagesOnPage(bytes, 1)).toBe(1);
});

test('remember the signature on this device, then delete it', async ({ page }) => {
  await open(page, 'simple.pdf');
  await page.getByRole('button', { name: 'Aggiungi firma' }).click();
  await dialog(page).getByRole('tab', { name: 'Scrivi' }).click();
  await dialog(page).getByLabel('Nome e cognome').fill('Mario Rossi');
  await dialog(page).getByLabel('Ricorda la mia firma su questo dispositivo').check();
  await dialog(page).getByRole('button', { name: 'Usa questa firma' }).click();
  await expect(page.locator('.signature')).toHaveCount(1);

  // After a reload the signature is ready: "Aggiungi firma" places it at once.
  await page.reload();
  await page.getByTestId('file-input').setInputFiles(fixture('simple.pdf'));
  await expect(page.getByRole('img', { name: 'Firma pronta da inserire' })).toBeVisible();
  await page.getByRole('button', { name: 'Aggiungi firma' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('.signature')).toHaveCount(1);

  // Delete it from the device.
  await page.getByRole('button', { name: 'Crea una nuova firma' }).click();
  await expect(dialog(page).getByText('Firma salvata su questo dispositivo')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Elimina la firma salvata' }).click();
  await dialog(page).getByRole('button', { name: 'Annulla' }).click();
  await expect(page.getByText('Firma salvata eliminata da questo dispositivo.')).toBeVisible();

  await page.reload();
  await page.getByTestId('file-input').setInputFiles(fixture('simple.pdf'));
  await expect(page.locator('.viewer')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Firma pronta da inserire' })).toHaveCount(0);
});

test('undo and redo: typing in a field and placing a signature', async ({ page }) => {
  await open(page, 'acroform.pdf');
  const nome = page.getByLabel('Nome', { exact: true });
  await nome.fill('Mario');
  await nome.press('Tab');
  await page.keyboard.press('Control+z');
  await expect(nome).toHaveValue('');
  await page.keyboard.press('Control+y');
  await expect(nome).toHaveValue('Mario');

  await page.getByRole('button', { name: 'Firma qui: Firma' }).click();
  await dialog(page).getByRole('tab', { name: 'Scrivi' }).click();
  await dialog(page).getByLabel('Nome e cognome').fill('Mario Rossi');
  await dialog(page).getByRole('button', { name: 'Usa questa firma' }).click();
  await expect(page.locator('.signature')).toHaveCount(1);

  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(page.locator('.signature')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Firma qui: Firma' })).toBeVisible();
  await page.getByRole('button', { name: 'Ripeti' }).click();
  await expect(page.locator('.signature')).toHaveCount(1);
  await expect(nome).toHaveValue('Mario');
});
