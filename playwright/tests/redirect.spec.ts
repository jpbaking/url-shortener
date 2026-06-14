import { test, expect, APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

const SHORT_DOMAIN  = process.env.SHORT_DOMAIN ?? 'short.url';
const S_DOMAIN      = process.env.S_DOMAIN     ?? 's.url';
const S_SCHEME      = process.env.S_SCHEME     ?? 'http';
const API           = `${S_SCHEME}://${SHORT_DOMAIN}/api/shorten`;
const REDIRECT_BASE = `${S_SCHEME}://${S_DOMAIN}`;

function uniqueUrl(suffix = '') {
  return `https://example.com/${Math.random().toString(36).slice(2)}${suffix}`;
}

async function shorten(request: APIRequestContext, longUrl: string): Promise<string> {
  const response = await request.post(API, { data: { longUrl } });
  const { shortUrl } = await response.json();
  return shortUrl as string;
}

function codeFrom(shortUrl: string): string {
  return shortUrl.split('/').pop()!;
}

async function psql(sql: string): Promise<string> {
  const client = new Client({
    host: 'postgres',
    database: process.env.POSTGRES_DB,
    user: 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  });
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rows[0] ? String(Object.values(result.rows[0])[0]) : '';
  } finally {
    await client.end();
  }
}

test.describe('redirect handler', () => {
  test('valid short code issues 302 with correct Location header', async ({ request }) => {
    const longUrl  = uniqueUrl('/redirect-test');
    const shortUrl = await shorten(request, longUrl);
    const code     = codeFrom(shortUrl);

    const response = await request.get(`${REDIRECT_BASE}/${code}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe(longUrl);
  });

  test('XSS payload in longUrl is HTML-escaped in the redirect body', async ({ request }) => {
    const xssPayload = 'https://example.com/?x="><script>alert(1)</script>';
    const shortUrl   = await shorten(request, xssPayload);
    const code       = codeFrom(shortUrl);

    const response = await request.get(`${REDIRECT_BASE}/${code}`, {
      maxRedirects: 0,
    });
    const body = await response.text();

    // Raw unescaped payload must not appear in any HTML context
    expect(body).not.toContain('<script>alert(1)</script>');
    // HTML attribute contexts must use entities
    expect(body).toContain('&lt;script&gt;');
    expect(body).toContain('&quot;');
    // JS context must escape </script to avoid closing the outer <script> block
    expect(body).toContain('<\\/script>');
    // Location header carries the unmodified original URL
    expect(response.headers()['location']).toBe(xssPayload);
  });

  test('non-existent code returns 404', async ({ request }) => {
    const response = await request.get(`${REDIRECT_BASE}/doesnotexist999`);
    expect(response.status()).toBe(404);
  });

  test('expired link returns 410 Gone', async ({ request }) => {
    // Insert a pre-expired record directly to avoid a 60-second wait.
    // Keep code ≤ 12 chars (VARCHAR(12) column constraint).
    const code = `x${Date.now().toString(36).slice(-8)}`;
    await psql(
      `INSERT INTO "ShortUrl" (code, "longUrl", "createdByIp", "clickCount", "expiresAt", "createdAt") ` +
      `VALUES ('${code}', 'https://expired.example.com', '127.0.0.1', 0, '2020-01-01 00:00:00', NOW())`
    );

    const response = await request.get(`${REDIRECT_BASE}/${code}`);
    expect(response.status()).toBe(410);
    expect(await response.text()).toMatch(/expired/i);
  });

  test('click count increments on each redirect visit', async ({ request }) => {
    const longUrl  = uniqueUrl('/click-count');
    const shortUrl = await shorten(request, longUrl);
    const code     = codeFrom(shortUrl);

    await request.get(`${REDIRECT_BASE}/${code}`, { maxRedirects: 0 });
    await request.get(`${REDIRECT_BASE}/${code}`, { maxRedirects: 0 });

    const count = await psql(`SELECT "clickCount" FROM "ShortUrl" WHERE code = '${code}'`);
    expect(parseInt(count, 10)).toBe(2);
  });

  test('invalid short code characters return 400', async ({ request }) => {
    const response = await request.get(`${REDIRECT_BASE}/!!invalid`, { maxRedirects: 0 });
    expect(response.status()).toBe(400);
  });
});
