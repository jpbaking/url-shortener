import { test, expect } from '@playwright/test';

const SHORT_DOMAIN = process.env.SHORT_DOMAIN ?? 'short.url';
const S_DOMAIN     = process.env.S_DOMAIN     ?? 's.url';
const S_SCHEME     = process.env.S_SCHEME     ?? 'http';
const SPA = `${S_SCHEME}://${SHORT_DOMAIN}`;

function uniqueUrl(suffix = '') {
  return `https://playwright-test.example.com/${Math.random().toString(36).slice(2)}${suffix}`;
}

test.describe('React SPA', () => {
  test('loads at short.url with the correct title and tagline', async ({ page }) => {
    await page.goto(SPA);
    await expect(page).toHaveTitle('short.url — URL Shortener');
    await expect(page.getByText('Paste a long URL. Get a short one.')).toBeVisible();
  });

  test('serves index.html for any deep path (SPA fallback)', async ({ page }) => {
    const response = await page.goto(`${SPA}/some/deep/path`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('short.url — URL Shortener');
  });

  test('Shorten button is disabled when the URL input is empty', async ({ page }) => {
    await page.goto(SPA);
    await expect(page.getByLabel('Shorten URL')).toBeDisabled();
  });

  test('Shorten button enables when the URL input is filled', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill('https://example.com');
    await expect(page.getByLabel('Shorten URL')).toBeEnabled();
  });

  test('golden path: clicking Shorten displays the result with a s.url link', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl());
    await page.getByLabel('Shorten URL').click();

    const result = page.getByRole('region', { name: 'Shortened URL' });
    await expect(result).toBeVisible();
    await expect(result.getByRole('link')).toHaveAttribute('href', new RegExp(`^${S_SCHEME}://${S_DOMAIN.replace(/\./g, '\\.')}/`));
  });

  test('Enter key on the URL input triggers shortening', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl());
    await page.getByLabel('Long URL to shorten').press('Enter');

    await expect(page.getByRole('region', { name: 'Shortened URL' })).toBeVisible();
  });

  test('"Shorten another" resets to idle: clears input and hides result', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl());
    await page.getByLabel('Shorten URL').click();
    await page.getByRole('region', { name: 'Shortened URL' }).waitFor();

    await page.getByRole('button', { name: 'Shorten another' }).click();

    await expect(page.getByRole('region', { name: 'Shortened URL' })).not.toBeVisible();
    await expect(page.getByLabel('Long URL to shorten')).toHaveValue('');
    await expect(page.getByLabel('Shorten URL')).toBeDisabled();
  });

  test('error state shown for a URL without a protocol', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill('not-a-url');
    await page.getByLabel('Shorten URL').click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/http/i);
  });

  test('expiry unit select is disabled when the expiry value is empty', async ({ page }) => {
    await page.goto(SPA);
    await expect(page.getByLabel('Expiry unit')).toBeDisabled();
  });

  test('expiry unit select enables when an expiry value is entered', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Expiry amount').fill('5');
    await expect(page.getByLabel('Expiry unit')).toBeEnabled();
  });

  test('result shows expiry note when an expiry was requested', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl('/expiry'));
    await page.getByLabel('Expiry amount').fill('2');
    await page.getByLabel('Expiry unit').selectOption('hours');
    await page.getByLabel('Shorten URL').click();

    const result = page.getByRole('region', { name: 'Shortened URL' });
    await expect(result).toBeVisible();
    await expect(result.getByText(/Expires/)).toBeVisible();
  });

  test('Copy button label changes to "Copied!" after click', async ({ page }) => {
    // navigator.clipboard requires a secure context and focus; stub it for headless Chrome.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
      });
    });
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl('/copy'));
    await page.getByLabel('Shorten URL').click();
    await page.getByRole('region', { name: 'Shortened URL' }).waitFor();

    await page.getByRole('button', { name: 'Copy to clipboard' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  });

  test('"Copied!" label auto-clears after 2 seconds', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
      });
    });
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl('/copy-clear'));
    await page.getByLabel('Shorten URL').click();
    await page.getByRole('region', { name: 'Shortened URL' }).waitFor();

    await page.getByRole('button', { name: 'Copy to clipboard' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy to clipboard' }))
      .toBeVisible({ timeout: 4_000 });
  });

  test('error alert clears when a valid URL is submitted after an error', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill('not-a-url');
    await page.getByLabel('Shorten URL').click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel('Long URL to shorten').fill(uniqueUrl('/error-clear'));
    await page.getByLabel('Shorten URL').click();

    await expect(page.getByRole('region', { name: 'Shortened URL' })).toBeVisible();
    await expect(page.getByRole('alert')).not.toBeVisible();
  });

  test('expiry note shows a formatted date, not just the label', async ({ page }) => {
    await page.goto(SPA);
    await page.getByLabel('Long URL to shorten').fill(uniqueUrl('/expiry-date'));
    await page.getByLabel('Expiry amount').fill('1');
    await page.getByLabel('Expiry unit').selectOption('days');
    await page.getByLabel('Shorten URL').click();

    const result = page.getByRole('region', { name: 'Shortened URL' });
    await expect(result).toBeVisible();
    // formatExpiry uses toLocaleString with dateStyle:'medium' — always includes a 4-digit year
    await expect(result.getByText(/Expires.*\d{4}/)).toBeVisible();
  });
});
