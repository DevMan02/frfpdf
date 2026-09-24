import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const fixture = (name: string) => join(import.meta.dirname, '../fixtures', name);

/**
 * Records every request the page makes. Everything must stay on the app's own
 * origin (or be a local blob:/data: URL): this is the "no file leaves the
 * device" guarantee, checked automatically.
 */
function trackRequests(page: Page) {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return;
    if (url.hostname !== 'localhost') external.push(request.url());
  });
  return external;
}

/** Fails the test on any console error (e.g. a Content Security Policy violation). */
function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openFixture(page: Page, name: string) {
  await page.getByTestId('file-input').setInputFiles(fixture(name));
}

test.describe('welcome screen', () => {
  test('shows name, subtitle and privacy statement', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveTitle('FrFPDF — Free for Real PDF');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('FrFPDF');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Free for Real PDF');
    await expect(page.getByText('I tuoi file non vengono mai inviati a un server esterno.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apri PDF' })).toBeVisible();
  });

  test('ships a restrictive Content Security Policy', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });
});

test.describe('opening and viewing', () => {
  test('renders every page with thumbnails and zoom', async ({ page }) => {
    const external = trackRequests(page);
    const errors = trackConsoleErrors(page);
    await page.goto('./');
    await openFixture(page, 'simple.pdf');

    await expect(page.getByText('simple.pdf')).toBeVisible();
    await expect(page.getByText('Pagina 1 di 3', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('img', { name: /^Pagina \d di 3$/ })).toHaveCount(3);
    await expect(page.getByRole('navigation', { name: 'Pagine' }).getByRole('button')).toHaveCount(3);

    // The first page actually gets drawn.
    await expect(page.getByRole('img', { name: 'Pagina 1 di 3' }).locator('canvas')).toHaveCount(1);
    await expect(page.getByText('I tuoi file restano sul tuo dispositivo: nulla viene caricato online.')).toBeVisible();

    // Zoom: fit-width is active by default, +/− switch to manual steps.
    const fit = page.getByRole('button', { name: 'Adatta alla larghezza' });
    await expect(fit).toHaveAttribute('aria-pressed', 'true');
    const zoomValue = page.locator('.toolbar__zoom-value');
    const before = await zoomValue.textContent();
    await page.getByRole('button', { name: 'Ingrandisci' }).click();
    await expect(zoomValue).not.toHaveText(before ?? '');
    await expect(fit).toHaveAttribute('aria-pressed', 'false');
    await fit.click();
    await expect(zoomValue).toHaveText(before ?? '');

    // Thumbnail navigation.
    await page.getByRole('button', { name: 'Vai alla pagina 3' }).click();
    await expect(page.getByRole('button', { name: 'Vai alla pagina 3' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('img', { name: 'Pagina 3 di 3' }).locator('canvas')).toHaveCount(1);

    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('keeps page rotation', async ({ page }) => {
    await page.goto('./');
    await openFixture(page, 'rotated.pdf');
    const first = page.getByRole('img', { name: 'Pagina 1 di 4' });
    const second = page.getByRole('img', { name: 'Pagina 2 di 4' });
    await expect(first).toBeVisible();
    const a = await first.boundingBox();
    const b = await second.boundingBox();
    // Page 1 is portrait, page 2 (rotated 90°) is landscape.
    expect(a!.height).toBeGreaterThan(a!.width);
    expect(b!.width).toBeGreaterThan(b!.height);
  });

  test('opens a file dropped on the page', async ({ page }) => {
    await page.goto('./');
    const bytes = readFileSync(fixture('simple.pdf')).toString('base64');
    const dataTransfer = await page.evaluateHandle((b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], 'trascinato.pdf', { type: 'application/pdf' }));
      return dt;
    }, bytes);
    await page.dispatchEvent('body', 'dragenter', { dataTransfer });
    await expect(page.getByText('Rilascia il file per aprirlo')).toBeVisible();
    await page.dispatchEvent('body', 'drop', { dataTransfer });
    await expect(page.getByText('trascinato.pdf')).toBeVisible();
    await expect(page.getByText('Rilascia il file per aprirlo')).toBeHidden();
  });
});

test.describe('clear errors', () => {
  const cases = [
    ['not-a-pdf.pdf', 'Questo file non è un PDF'],
    ['corrupted.pdf', 'Il file è danneggiato'],
    ['protected.pdf', 'Questo PDF è protetto da password'],
  ] as const;

  for (const [file, message] of cases) {
    test(`explains why ${file} cannot be opened`, async ({ page }) => {
      await page.goto('./');
      await openFixture(page, file);
      await expect(page.getByRole('alert')).toContainText(message);
      // Still on the welcome screen, ready for another file.
      await expect(page.getByRole('button', { name: 'Apri PDF' })).toBeEnabled();
    });
  }
});

test.describe('download', () => {
  test('saves an unmodified copy named *_modificato.pdf', async ({ page }) => {
    const external = trackRequests(page);
    const errors = trackConsoleErrors(page);
    await page.goto('./');
    await openFixture(page, 'rotated.pdf');
    await expect(page.getByText('Pagina 1 di 4', { exact: true }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Scarica PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('rotated_modificato.pdf');
    await expect(page.getByRole('status').filter({ hasText: 'Scaricato' })).toHaveText(
      'Scaricato: rotated_modificato.pdf',
    );

    const saved = await PDFDocument.load(readFileSync(await download.path()));
    expect(saved.getPageCount()).toBe(4);
    expect(saved.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 180, 270]);

    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
});
