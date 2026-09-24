import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
  return { external, errors };
}

async function download(page: Page, confirmEmpty = false) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica PDF' }).click();
  if (confirmEmpty) await page.getByRole('button', { name: 'Scarica comunque' }).click();
  const file = await downloadPromise;
  return new Uint8Array(readFileSync(await file.path()));
}

async function pageText(bytes: Uint8Array, pageNumber: number) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

test('fill an AcroForm with the keyboard, confirm empty fields, download a locked copy', async ({ page }) => {
  const { external, errors } = await open(page, 'acroform.pdf');

  await expect(page.getByText('9 campi da compilare su 10.')).toBeVisible();
  await expect(field(page, 'Email')).toHaveValue('mario.rossi@example.com');

  // Tab follows the reading order of the page.
  await field(page, 'Nome').click();
  await page.keyboard.type('Łukasz');
  await page.keyboard.press('Tab');
  await expect(field(page, 'Cognome')).toBeFocused();
  await page.keyboard.type('Dvořák');
  await page.keyboard.press('Tab');
  await expect(field(page, 'Codice fiscale')).toBeFocused();
  await page.keyboard.type('DVRLKS80A01Z127XEXTRA'); // maxLength 16
  await expect(field(page, 'Codice fiscale')).toHaveValue('DVRLKS80A01Z127X');
  await page.keyboard.press('Shift+Tab');
  await expect(field(page, 'Cognome')).toBeFocused();

  // "Oggi" fills the date field.
  await field(page, 'Data nascita').focus();
  await page.getByRole('button', { name: 'Inserisci la data di oggi: Data nascita' }).click();
  await expect(field(page, 'Data nascita')).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);

  await field(page, 'Provincia').selectOption('Torino');
  await field(page, 'Tipo: ridotta').check();
  await field(page, 'Privacy').check();
  await expect(page.getByText('3 campi da compilare su 10.')).toBeVisible();

  // Empty fields: the dialog offers to go back, focusing the first empty one.
  await page.getByRole('button', { name: 'Scarica PDF' }).click();
  await expect(page.getByText('3 campi non compilati: vuoi scaricare comunque?')).toBeVisible();
  await page.getByRole('button', { name: 'Torna al modulo' }).click();
  await expect(field(page, 'Note')).toBeFocused();
  await page.keyboard.type('Nessuna nota');
  await field(page, 'Luogo').fill('Milano');
  await field(page, 'Data').fill('24/09/2026');
  await expect(page.getByText('Tutti i 10 campi sono compilati.')).toBeVisible();

  // Everything filled: no dialog. "Blocca i campi compilati" is on by default.
  await expect(page.getByLabel('Blocca i campi compilati')).toBeChecked();
  const bytes = await download(page);

  const saved = await PDFDocument.load(bytes);
  expect(saved.getForm().getFields()).toHaveLength(0);
  const text = await pageText(bytes, 1);
  for (const value of ['Łukasz', 'Dvořák', 'DVRLKS80A01Z127X', 'Torino', 'Nessuna nota']) expect(text).toContain(value);
  expect(await pageText(bytes, 2)).toContain('Milano');

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('keeps the fields editable when "Blocca i campi compilati" is off', async ({ page }) => {
  await open(page, 'acroform.pdf');
  await field(page, 'Nome').fill('Mario');
  await field(page, 'Tipo: ordinaria').check();
  await page.getByLabel('Blocca i campi compilati').uncheck();
  await expect(page.getByText('I campi restano compilabili, anche in altri programmi.')).toBeVisible();

  const form = (await PDFDocument.load(await download(page, true))).getForm();
  expect(form.getTextField('nome').getText()).toBe('Mario');
  expect(form.getRadioGroup('tipo').getSelected()).toBe('ordinaria');
});

test('explains which characters cannot be saved', async ({ page }) => {
  await open(page, 'acroform.pdf');
  await field(page, 'Nome').fill('Nguyễn');
  await page.getByRole('button', { name: 'Scarica PDF' }).click();
  await page.getByRole('button', { name: 'Scarica comunque' }).click();
  await expect(page.getByRole('alert')).toContainText('Questi caratteri non si possono salvare nel PDF: ễ');
});

test('fields follow page rotation', async ({ page }) => {
  await open(page, 'acroform-rotated.pdf');
  const box = await page.locator('.field').first().boundingBox();
  // A 160×20 pt field on a page rotated 90° is tall and narrow on screen.
  expect(box!.height).toBeGreaterThan(box!.width * 4);
});

test('XFA forms: explains that pure XFA is not supported', async ({ page }) => {
  await open(page, 'xfa-pure.pdf');
  await expect(page.getByRole('status').filter({ hasText: 'formato XFA' })).toBeVisible();
  await expect(page.locator('.field')).toHaveCount(0);
});

test('XFA forms: hybrid forms use the standard fields', async ({ page }) => {
  await open(page, 'xfa-hybrid.pdf');
  await expect(field(page, 'Nome')).toBeVisible();
  await expect(page.getByText(/contiene anche una versione XFA/)).toBeVisible();
});
