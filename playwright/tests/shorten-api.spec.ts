import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const SHORT_DOMAIN = process.env.SHORT_DOMAIN ?? 'short.url';
const S_DOMAIN     = process.env.S_DOMAIN     ?? 's.url';
const S_SCHEME     = process.env.S_SCHEME     ?? 'http';
const API = `${S_SCHEME}://${SHORT_DOMAIN}/api/shorten`;

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

function uniqueUrl(suffix = '') {
  return `https://example.com/${Math.random().toString(36).slice(2)}${suffix}`;
}

test.describe('POST /api/shorten', () => {
  test('201 with shortUrl and null expiresAt for a valid URL', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl() },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.shortUrl).toMatch(new RegExp(`^${S_SCHEME}://${S_DOMAIN.replace(/\./g, '\\.')}/`));
    expect(body.expiresAt).toBeNull();
  });

  test('201 with correct expiresAt when expiry is supplied', async ({ request }) => {
    const before = Date.now();
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl('/expiry'), expiryValue: 1, expiryUnit: 'hours' },
    });
    const after = Date.now();

    expect(response.status()).toBe(201);
    const { expiresAt } = await response.json();
    expect(expiresAt).not.toBeNull();
    const ts = new Date(expiresAt).getTime();
    expect(ts).toBeGreaterThan(before + 59 * 60_000);
    expect(ts).toBeLessThan(after  + 61 * 60_000);
  });

  test('429 when same IP submits the same URL within 1 hour', async ({ request }) => {
    const longUrl = uniqueUrl('/rate-limit');
    const r1 = await request.post(API, { data: { longUrl } });
    expect(r1.status()).toBe(201);

    const r2 = await request.post(API, { data: { longUrl } });
    expect(r2.status()).toBe(429);
    expect((await r2.json()).error).toMatch(/hour/i);
    const retryAfter = Number(r2.headers()['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  test('400 when longUrl is missing', async ({ request }) => {
    const response = await request.post(API, { data: {} });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('longUrl is required.');
  });

  test('400 when longUrl is an empty string', async ({ request }) => {
    const response = await request.post(API, { data: { longUrl: '' } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('longUrl is required.');
  });

  test('400 when URL has no protocol', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: 'www.example.com/no-protocol' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/http/i);
  });

  test('400 for ftp:// URL', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: 'ftp://files.example.com/' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/http/i);
  });

  test('400 when URL exceeds 2048 characters', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: 'https://example.com/' + 'a'.repeat(2050) },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/length/i);
  });

  test('400 JSON (no stack trace, no HTML) for malformed JSON body', async ({ request }) => {
    const response = await request.post(API, {
      headers: { 'Content-Type': 'application/json' },
      data: 'not-valid-json',
    });
    expect(response.status()).toBe(400);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).not.toMatch(/node_modules/);
    expect(body.error).not.toMatch(/at JSON\.parse/);
  });

  test('400 when expiryUnit is unrecognized', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl(), expiryValue: 5, expiryUnit: 'decades' },
    });
    expect(response.status()).toBe(400);
    const { error } = await response.json();
    expect(error).toMatch(/expiryUnit/);
    expect(error).toMatch(/minutes/);
  });

  test('405 JSON for GET request', async ({ request }) => {
    const response = await request.get(API);
    expect(response.status()).toBe(405);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toHaveProperty('error');
  });

  test('405 JSON for PUT request', async ({ request }) => {
    const response = await request.put(API, { data: {} });
    expect(response.status()).toBe(405);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toHaveProperty('error');
  });

  test('405 JSON for DELETE request', async ({ request }) => {
    const response = await request.delete(API);
    expect(response.status()).toBe(405);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toHaveProperty('error');
  });

  test('201 for a URL exactly 2048 characters long (on-boundary)', async ({ request }) => {
    const base    = `https://example.com/${Math.random().toString(36).slice(2)}/`;
    const longUrl = base + 'a'.repeat(2048 - base.length);
    expect(longUrl.length).toBe(2048);
    const response = await request.post(API, { data: { longUrl } });
    expect(response.status()).toBe(201);
  });

  test('400 when longUrl is not a string', async ({ request }) => {
    const response = await request.post(API, { data: { longUrl: 42 } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('longUrl is required.');
  });

  test('400 when expiryValue is supplied without expiryUnit', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl(), expiryValue: 5 },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/expiryUnit/);
  });

  test('400 when expiryValue is zero', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl(), expiryValue: 0, expiryUnit: 'hours' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/expiryValue/);
  });

  test('400 when expiryValue is negative', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl(), expiryValue: -1, expiryUnit: 'hours' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/expiryValue/);
  });

  test('400 when expiryValue is a float', async ({ request }) => {
    const response = await request.post(API, {
      data: { longUrl: uniqueUrl(), expiryValue: 1.5, expiryUnit: 'hours' },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/expiryValue/);
  });

  test('201 with a fresh code after the 1-hour cooldown window has passed', async ({ request }) => {
    const longUrl = uniqueUrl('/rate-limit-elapsed');

    const r1 = await request.post(API, { data: { longUrl } });
    const { shortUrl: shortUrl1 } = await r1.json();
    const code1 = shortUrl1.split('/').pop();

    // Backdate the entry so the cooldown window is considered elapsed.
    await psql(`UPDATE "ShortUrl" SET "createdAt" = NOW() - INTERVAL '2 hours' WHERE code = '${code1}'`);

    const r2 = await request.post(API, { data: { longUrl } });
    expect(r2.status()).toBe(201);
    const { shortUrl: shortUrl2 } = await r2.json();
    expect(shortUrl2).not.toBe(shortUrl1);
  });
});
