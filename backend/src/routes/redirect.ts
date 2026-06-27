import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const logoMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="13" fill="#12279E"/><g transform="translate(42,42) rotate(45)"><rect x="-17" y="-6.5" width="34" height="13" rx="6.5" fill="none" stroke="#D9821F" stroke-width="3.2"/></g><g transform="translate(22,22) rotate(45)"><rect x="-17" y="-6.5" width="34" height="13" rx="6.5" fill="#12279E"/><rect x="-17" y="-6.5" width="34" height="13" rx="6.5" fill="none" stroke="#FFFFFF" stroke-width="3.2"/></g></svg>`;

const meshBlueSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="1010" viewBox="0 0 1060 1010"><g stroke="#12279E" stroke-width="1.5" fill="none"><path d="M120 70 L300 110 L470 60 L650 120 L820 70 L960 140 M70 260 L250 230 L430 280 L610 240 L790 290 L950 250 M140 430 L320 460 L500 410 L680 450 L860 420 L980 470 M80 610 L260 580 L450 630 L620 590 L800 640 L940 600 M150 790 L330 760 L510 810 L690 770 L870 800 L990 760 M90 940 L280 920 L470 960 L650 930 L830 950 L960 930 M120 70 L70 260 L140 430 L80 610 L150 790 L90 940 M300 110 L250 230 L320 460 L260 580 L330 760 L280 920 M470 60 L430 280 L500 410 L450 630 L510 810 L470 960 M650 120 L610 240 L680 450 L620 590 L690 770 L650 930 M820 70 L790 290 L860 420 L800 640 L870 800 L830 950 M960 140 L950 250 L980 470 L940 600 L990 760 L960 930 M300 110 L430 280 M610 240 L860 420 M320 460 L450 630 M620 590 L870 800 M330 760 L470 960 M650 120 L790 290 M500 410 L620 590 M250 230 L500 410 M260 580 L510 810 M980 470 L800 640 M470 60 L610 240 M690 770 L830 950 M790 290 L980 470 M450 630 L690 770"></path></g><circle cx="120" cy="70" r="5" fill="#12279E"></circle><circle cx="300" cy="110" r="5" fill="#12279E"></circle><circle cx="470" cy="60" r="5" fill="#12279E"></circle><circle cx="820" cy="70" r="5" fill="#12279E"></circle><circle cx="960" cy="140" r="5" fill="#12279E"></circle><circle cx="70" cy="260" r="5" fill="#12279E"></circle><circle cx="250" cy="230" r="5" fill="#12279E"></circle><circle cx="610" cy="240" r="5" fill="#12279E"></circle><circle cx="790" cy="290" r="5" fill="#12279E"></circle><circle cx="950" cy="250" r="5" fill="#12279E"></circle><circle cx="140" cy="430" r="5" fill="#12279E"></circle><circle cx="320" cy="460" r="5" fill="#12279E"></circle><circle cx="500" cy="410" r="5" fill="#12279E"></circle><circle cx="680" cy="450" r="5" fill="#12279E"></circle><circle cx="980" cy="470" r="5" fill="#12279E"></circle><circle cx="80" cy="610" r="5" fill="#12279E"></circle><circle cx="260" cy="580" r="5" fill="#12279E"></circle><circle cx="450" cy="630" r="5" fill="#12279E"></circle><circle cx="800" cy="640" r="5" fill="#12279E"></circle><circle cx="940" cy="600" r="5" fill="#12279E"></circle><circle cx="150" cy="790" r="5" fill="#12279E"></circle><circle cx="510" cy="810" r="5" fill="#12279E"></circle><circle cx="690" cy="770" r="5" fill="#12279E"></circle><circle cx="870" cy="800" r="5" fill="#12279E"></circle><circle cx="990" cy="760" r="5" fill="#12279E"></circle><circle cx="90" cy="940" r="5" fill="#12279E"></circle><circle cx="280" cy="920" r="5" fill="#12279E"></circle><circle cx="650" cy="930" r="5" fill="#12279E"></circle><circle cx="830" cy="950" r="5" fill="#12279E"></circle><circle cx="960" cy="930" r="5" fill="#12279E"></circle><circle cx="430" cy="280" r="8" fill="#D9821F"></circle><circle cx="620" cy="590" r="8" fill="#D9821F"></circle><circle cx="860" cy="420" r="8" fill="#D9821F"></circle><circle cx="330" cy="760" r="8" fill="#D9821F"></circle><circle cx="650" cy="120" r="8" fill="#D9821F"></circle><circle cx="470" cy="960" r="8" fill="#D9821F"></circle></svg>`;
const meshWhiteSvg = meshBlueSvg
  .replace(/#12279E/g, '#FFFFFF')
  .replace(/#D9821F/g, '#FFFFFF');

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusPage(status: number, kicker: string, title: string, message: string): string {
  const meshBlue = svgDataUri(meshBlueSvg);
  const meshWhite = svgDataUri(meshWhiteSvg);
  const favicon = svgDataUri(logoMarkSvg);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${status} — ${htmlEscape(title)}</title>
    <link rel="icon" href="${favicon}" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --brand-blue: #12279E;
        --brand-blue-deep: #0B1660;
        --accent-amber: #D9821F;
        --ink: #16182E;
        --muted: #61657F;
        --line: #E5E7F1;
        --surface: #F4F5FB;
        --base: #FFFFFF;
        --text-on-blue: #FFFFFF;
        --text-on-blue-dim: rgba(255,255,255,0.78);
        --font-sans: "IBM Plex Sans", system-ui, -apple-system, Segoe UI, sans-serif;
        --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        color: var(--ink);
        background: var(--base);
        font-family: var(--font-sans);
        -webkit-font-smoothing: antialiased;
      }

      main {
        min-height: 100vh;
        display: grid;
        align-content: start;
        justify-items: center;
        gap: 40px;
        padding: clamp(48px, 9vh, 88px) 18px 40px;
        position: relative;
        overflow: hidden;
      }

      main::before {
        position: absolute;
        inset: 0 0 auto;
        height: clamp(380px, 42vh, 500px);
        content: "";
        background: var(--brand-blue);
        z-index: -2;
      }

      main::after {
        position: absolute;
        right: max(-18vw, -180px);
        bottom: max(-18vw, -170px);
        width: min(760px, 95vw);
        aspect-ratio: 1;
        content: "";
        background: url("${meshBlue}") center / contain no-repeat;
        opacity: 0.11;
        z-index: -1;
      }

      .hero, .card, footer { width: min(100%, 860px); }
      .hero {
        position: relative;
        color: var(--text-on-blue);
      }

      .hero::before {
        position: absolute;
        inset: -72px -32vw -96px;
        content: "";
        background: url("${meshWhite}") center top / min(1060px, 150vw) auto no-repeat;
        opacity: 0.16;
        pointer-events: none;
        z-index: -1;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 26px;
      }

      .mark {
        width: 48px;
        height: 48px;
        border-radius: 13px;
      }

      .wordmark {
        color: var(--text-on-blue);
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .kicker {
        position: relative;
        margin: 0 0 12px;
        padding-left: 12px;
        color: var(--text-on-blue-dim);
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .kicker::before {
        position: absolute;
        left: 0;
        top: 0.2em;
        bottom: 0.2em;
        width: 3px;
        content: "";
        background: var(--accent-amber);
      }

      h1 {
        max-width: 620px;
        margin: 0;
        color: var(--text-on-blue);
        font-size: clamp(32px, 5vw, 56px);
        line-height: 1.02;
        letter-spacing: -0.02em;
      }

      .lead {
        max-width: 520px;
        margin: 12px 0 0;
        color: var(--text-on-blue-dim);
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 40px;
        background: var(--base);
        border: 1px solid var(--line);
        border-radius: 13px;
        box-shadow: 0 8px 30px rgba(11,22,96,0.12);
      }

      .code {
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .message {
        margin: 0;
        color: var(--ink);
        font-size: 16px;
      }

      footer {
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-align: center;
        text-transform: uppercase;
      }

      @media (max-width: 768px) {
        main {
          gap: 26px;
          padding-top: 26px;
        }
        main::before { height: 340px; }
        .card { padding: 26px; }
      }

      @media (max-width: 480px) {
        main {
          padding-right: 12px;
          padding-left: 12px;
        }
        main::before { height: 340px; }
        .card { padding: 18px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" aria-labelledby="page-title">
        <div class="brand">
          <img class="mark" src="${favicon}" alt="" />
          <span class="wordmark">${htmlEscape(process.env.S_DOMAIN ?? 'short link')}</span>
        </div>
        <p class="kicker">${htmlEscape(kicker)}</p>
        <h1 id="page-title">${htmlEscape(title)}</h1>
        <p class="lead">The short link could not be resolved.</p>
      </section>

      <section class="card" aria-label="${htmlEscape(title)}">
        <span class="code">HTTP ${status}</span>
        <p class="message">${htmlEscape(message)}</p>
      </section>

      <footer>Links without an expiry date never expire.</footer>
    </main>
  </body>
</html>`;
}

function sendStatusPage(res: Response, status: number, kicker: string, title: string, message: string): void {
  res
    .status(status)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(statusPage(status, kicker, title, message));
}

// GET /:code
// Looks up the short code, checks expiry, increments click count, issues 302.
router.get('/:code', async (req: Request, res: Response) => {
  const { code } = req.params;

  if (!code || !/^[a-zA-Z0-9]+$/.test(code)) {
    sendStatusPage(res, 400, 'Invalid code', 'This short code is not valid.', 'Short codes may only contain letters and numbers.');
    return;
  }

  try {
    const entry = await prisma.shortUrl.findUnique({ where: { code } });

    if (!entry) {
      sendStatusPage(res, 404, '404', 'This short link does not exist.', 'Check the code and try again, or create a new short link from the main shortener.');
      return;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      sendStatusPage(res, 410, 'Expired', 'This short link has expired.', 'The destination is no longer available through this short code.');
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
    sendStatusPage(res, 500, 'Error', 'The redirect could not be resolved.', 'Try again in a moment.');
  }
});

export default router;
