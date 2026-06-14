import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateCode } from '../base62';

const router = Router();
const prisma = new PrismaClient();

type ExpiryUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

const UNIT_TO_MS: Record<ExpiryUnit, number> = {
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
  weeks:   7 * 24 * 60 * 60 * 1000,
  months:  30 * 24 * 60 * 60 * 1000,
};

function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type ExpiryResult =
  | { ok: true; expiresAt: Date | null }
  | { ok: false; error: string };

function computeExpiresAt(value: unknown, unit: unknown): ExpiryResult {
  if (value === undefined || value === null || value === '') {
    return { ok: true, expiresAt: null };
  }

  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return { ok: false, error: 'expiryValue must be a positive integer.' };
  }

  if (!unit || typeof unit !== 'string' || !(unit in UNIT_TO_MS)) {
    return { ok: false, error: `expiryUnit must be one of: ${Object.keys(UNIT_TO_MS).join(', ')}.` };
  }

  return { ok: true, expiresAt: new Date(Date.now() + num * UNIT_TO_MS[unit as ExpiryUnit]) };
}

// Extract the real client IP, trusting Nginx's X-Real-IP header.
// Falls back to the socket address for local dev (no Nginx).
function getClientIp(req: Request): string {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  return req.socket.remoteAddress ?? 'unknown';
}

// POST /api/shorten
// Body: { longUrl: string, expiryValue?: number, expiryUnit?: ExpiryUnit }
// Returns: { shortUrl: string, expiresAt: string | null }
router.post('/', async (req: Request, res: Response) => {
  const { longUrl, expiryValue, expiryUnit } = req.body as {
    longUrl?: string;
    expiryValue?: unknown;
    expiryUnit?: unknown;
  };

  if (!longUrl || typeof longUrl !== 'string') {
    res.status(400).json({ error: 'longUrl is required.' });
    return;
  }

  if (longUrl.length > 2048) {
    res.status(400).json({ error: 'URL exceeds maximum allowed length.' });
    return;
  }

  if (!isValidUrl(longUrl)) {
    res.status(400).json({ error: 'Invalid URL. Must start with http:// or https://' });
    return;
  }

  const expiryResult = computeExpiresAt(expiryValue, expiryUnit);
  if (!expiryResult.ok) {
    res.status(400).json({ error: expiryResult.error });
    return;
  }
  const { expiresAt } = expiryResult;
  const createdByIp = getClientIp(req);

  try {
    // Dedup: same IP + same long URL returns the existing short code.
    // If that link has already expired, fall through and create a fresh one.
    const existing = await prisma.shortUrl.findFirst({
      where: {
        longUrl,
        createdByIp,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (existing) {
      res.json({
        shortUrl: `${process.env.REDIRECT_DOMAIN}/${existing.code}`,
        expiresAt: existing.expiresAt?.toISOString() ?? null,
      });
      return;
    }

    let entry = null;
    for (let len = 6; len <= 16; len++) {
      try {
        entry = await prisma.shortUrl.create({
          data: { code: generateCode(len), longUrl, createdByIp, expiresAt },
        });
        break;
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002') continue;
        throw err;
      }
    }

    if (!entry) {
      res.status(500).json({ error: 'Internal server error.' });
      return;
    }

    res.status(201).json({
      shortUrl: `${process.env.REDIRECT_DOMAIN}/${entry.code}`,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.all('/', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed. Use POST /api/shorten.' });
});

export default router;
