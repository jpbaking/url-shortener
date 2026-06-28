import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateCode } from '../base62';
import { getClientIdentity, getExistingClientIdHash } from '../client-identity';
import { getRedirectBaseUrl } from '../url-config';

const router = Router();
const prisma = new PrismaClient();

const CUSTOM_CODE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,14}[a-zA-Z0-9]$/;

type ExpiryUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

const UNIT_TO_MS: Record<ExpiryUnit, number> = {
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
  weeks:   7 * 24 * 60 * 60 * 1000,
  months:  30 * 24 * 60 * 60 * 1000,
};

type ActiveShortUrlRow = {
  code: string;
  longUrl: string;
  clickCount: number;
  expiresAt: Date | null;
  createdAt: Date;
};

function getMaxExpiryMonths(): number {
  const raw = process.env.MAX_LINK_EXPIRY_MONTHS;
  if (raw === undefined || raw === '') return 12;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`Invalid MAX_LINK_EXPIRY_MONTHS="${raw}". Falling back to 12.`);
    return 12;
  }
  return parsed;
}

function getCooldownMinutes(): number {
  const raw = process.env.SHORTEN_COOLDOWN_MINUTES;
  if (raw === undefined || raw === '') return 60;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`Invalid SHORTEN_COOLDOWN_MINUTES="${raw}". Falling back to 60.`);
    return 60;
  }

  return parsed;
}

function formatDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type ExpiryResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; error: string };

function computeExpiresAt(value: unknown, unit: unknown): ExpiryResult {
  const maxExpiresAt = new Date(Date.now() + getMaxExpiryMonths() * UNIT_TO_MS.months);

  if (value === undefined || value === null || value === '') {
    return { ok: true, expiresAt: maxExpiresAt };
  }

  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return { ok: false, error: 'expiryValue must be a positive integer.' };
  }

  if (!unit || typeof unit !== 'string' || !(unit in UNIT_TO_MS)) {
    return { ok: false, error: `expiryUnit must be one of: ${Object.keys(UNIT_TO_MS).join(', ')}.` };
  }

  const requested = new Date(Date.now() + num * UNIT_TO_MS[unit as ExpiryUnit]);
  if (requested > maxExpiresAt) {
    return { ok: false, error: `Expiry cannot exceed ${getMaxExpiryMonths()} months.` };
  }
  return { ok: true, expiresAt: requested };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const clientIdHash = getExistingClientIdHash(req);
    if (!clientIdHash) {
      res.json({ links: [] });
      return;
    }

    const now = new Date();
    const redirectBaseUrl = getRedirectBaseUrl();
    const links = await prisma.shortUrl.findMany({
      where: {
        clientIdHash,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        code: true,
        longUrl: true,
        clickCount: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.json({
      links: links.map((link: ActiveShortUrlRow) => ({
        code: link.code,
        longUrl: link.longUrl,
        shortUrl: `${redirectBaseUrl}/${link.code}`,
        clickCount: link.clickCount,
        expiresAt: link.expiresAt?.toISOString() ?? null,
        createdAt: link.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error listing active short URLs:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/shorten
// Body: { longUrl: string, expiryValue?: number, expiryUnit?: ExpiryUnit, customCode?: string }
// Returns: { shortUrl: string, expiresAt: string }
router.post('/', async (req: Request, res: Response) => {
  const { longUrl, expiryValue, expiryUnit, customCode } = req.body as {
    longUrl?: string;
    expiryValue?: unknown;
    expiryUnit?: unknown;
    customCode?: unknown;
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

  let resolvedCustomCode: string | undefined;
  if (customCode !== undefined && customCode !== null && customCode !== '') {
    if (typeof customCode !== 'string' || !CUSTOM_CODE_RE.test(customCode)) {
      res.status(400).json({ error: 'Custom ID must be 3–16 characters. Use letters, numbers, hyphens, and underscores; start and end with a letter or number.' });
      return;
    }
    resolvedCustomCode = customCode;
  }

  const expiryResult = computeExpiresAt(expiryValue, expiryUnit);
  if (!expiryResult.ok) {
    res.status(400).json({ error: expiryResult.error });
    return;
  }
  const { expiresAt } = expiryResult;
  try {
    const redirectBaseUrl = getRedirectBaseUrl();
    const { clientIdHash, createdByIpHash } = getClientIdentity(req, res);
    let entry;

    if (resolvedCustomCode) {
      // Clear any expired record occupying this code so it can be reclaimed.
      await prisma.shortUrl.deleteMany({
        where: { code: resolvedCustomCode, expiresAt: { lte: new Date() } },
      });

      try {
        entry = await prisma.shortUrl.create({
          data: { code: resolvedCustomCode, longUrl, clientIdHash, createdByIpHash, expiresAt },
        });
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002') {
          res.status(409).json({ error: 'This custom ID is already in use. Try a different one.' });
          return;
        }
        throw err;
      }
    } else {
      const cooldownMinutes = getCooldownMinutes();
      const cooldownMs = cooldownMinutes * 60 * 1000;
      const now = new Date();
      const cooldownStart = new Date(Date.now() - cooldownMs);
      const recent = await prisma.shortUrl.findFirst({
        where: {
          longUrl,
          clientIdHash,
          createdAt: { gt: cooldownStart },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { code: true, createdAt: true, expiresAt: true },
      });
      if (recent) {
        const retryAfter = Math.max(1, Math.ceil((recent.createdAt.getTime() + cooldownMs - Date.now()) / 1000));
        const waitLabel = formatDuration(retryAfter);
        res.status(429)
          .set('Retry-After', String(retryAfter))
          .json({
            error: `This URL was already shortened recently in this browser. Use the existing short URL below, or wait about ${waitLabel} to generate a unique new short URL. If the existing short URL expires first, you can generate a new one then.`,
            shortUrl: `${redirectBaseUrl}/${recent.code}`,
            expiresAt: recent.expiresAt?.toISOString() ?? null,
            retryAfter,
            waitLabel,
          });
        return;
      }

      entry = null;
      for (let len = 6; len <= 16; len++) {
        try {
          entry = await prisma.shortUrl.create({
            data: { code: generateCode(len), longUrl, clientIdHash, createdByIpHash, expiresAt },
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
    }

    res.status(201).json({
      shortUrl: `${redirectBaseUrl}/${entry.code}`,
      expiresAt: entry.expiresAt!.toISOString(),
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
