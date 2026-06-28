import { Request, Response } from 'express';
import crypto from 'crypto';

const DEFAULT_COOKIE_NAME = 'lw_client_id';
const DEFAULT_COOKIE_MAX_AGE_DAYS = 365;

export type ClientIdentity = {
  clientIdHash: string;
  createdByIpHash: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function hmacHex(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function getCookieName(): string {
  return process.env.CLIENT_COOKIE_NAME || DEFAULT_COOKIE_NAME;
}

function getCookieMaxAgeDays(): number {
  const raw = process.env.CLIENT_COOKIE_MAX_AGE_DAYS;
  if (raw === undefined || raw === '') return DEFAULT_COOKIE_MAX_AGE_DAYS;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`Invalid CLIENT_COOKIE_MAX_AGE_DAYS="${raw}". Falling back to ${DEFAULT_COOKIE_MAX_AGE_DAYS}.`);
    return DEFAULT_COOKIE_MAX_AGE_DAYS;
  }

  return parsed;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name || valueParts.length === 0) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function isValidClientId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
}

function getExistingClientId(req: Request): string | null {
  const existing = parseCookies(req.headers.cookie)[getCookieName()];
  return isValidClientId(existing) ? existing : null;
}

function getOrSetClientId(req: Request, res: Response): string {
  const existing = getExistingClientId(req);
  if (existing) return existing;

  const clientId = crypto.randomBytes(16).toString('hex');
  res.cookie(getCookieName(), clientId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: getCookieMaxAgeDays() * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return clientId;
}

// Extract the real client IP, trusting Nginx's X-Real-IP header.
// Falls back to the socket address for local dev (no Nginx).
function getClientIp(req: Request): string {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  return req.socket.remoteAddress ?? 'unknown';
}

export function getClientIdentity(req: Request, res: Response): ClientIdentity {
  const clientId = getOrSetClientId(req, res);
  return {
    clientIdHash: hmacHex(requiredEnv('CLIENT_ID_HASH_SECRET'), clientId),
    createdByIpHash: hmacHex(requiredEnv('IP_HASH_SECRET'), getClientIp(req)),
  };
}

export function getExistingClientIdHash(req: Request): string | null {
  const clientId = getExistingClientId(req);
  if (!clientId) return null;
  return hmacHex(requiredEnv('CLIENT_ID_HASH_SECRET'), clientId);
}
