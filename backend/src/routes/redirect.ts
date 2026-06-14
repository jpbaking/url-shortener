import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// GET /:code
// Looks up the short code, checks expiry, increments click count, issues 302.
router.get('/:code', async (req: Request, res: Response) => {
  const { code } = req.params;

  if (!code || !/^[a-zA-Z0-9]+$/.test(code)) {
    res.status(400).send('Invalid short code.');
    return;
  }

  try {
    const entry = await prisma.shortUrl.findUnique({ where: { code } });

    if (!entry) {
      res.status(404).send('Short URL not found.');
      return;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      res.status(410).send('This link has expired.');
      return;
    }

    // Fire-and-forget click count increment — don't let a failed update
    // block the redirect, which is the user-facing critical path.
    prisma.shortUrl.update({
      where: { id: entry.id },
      data: { clickCount: { increment: 1 } },
    }).catch((err: unknown) => console.error('Failed to increment click count:', err));

    const target    = entry.longUrl;
    const safeTarget = htmlEscape(target);
    // Prevent </script> inside a JSON string from closing the outer <script> block.
    const safeJs    = JSON.stringify(target).replace(/<\/script/gi, '<\\/script');

    // Primary: HTTP 302. The Location header is all a compliant browser needs.
    // Fallback body: <meta refresh> handles browsers that ignore Location,
    // and the JS redirect handles anything that executes scripts but not meta tags.
    // The visible <a> is the last resort for everything else.
    res
      .status(302)
      .setHeader('Location', target)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${safeTarget}" />
    <title>Redirecting…</title>
    <script>window.location.replace(${safeJs});</script>
  </head>
  <body>
    <p>Redirecting… <a href="${safeTarget}">Click here if you are not redirected.</a></p>
  </body>
</html>`);
  } catch (error) {
    console.error('Error resolving short code:', error);
    res.status(500).send('Internal server error.');
  }
});

export default router;
