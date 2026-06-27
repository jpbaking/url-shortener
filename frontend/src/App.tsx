import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import styles from './App.module.css';

type ExpiryUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

const EXPIRY_UNITS: ExpiryUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];

const UNIT_TO_MS: Record<ExpiryUnit, number> = {
  minutes: 60 * 1000,
  hours:   60 * 60 * 1000,
  days:    24 * 60 * 60 * 1000,
  weeks:   7 * 24 * 60 * 60 * 1000,
  months:  30 * 24 * 60 * 60 * 1000,
};

const CUSTOM_CODE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,14}[a-zA-Z0-9]$/;

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; shortUrl: string; expiresAt: string | null }
  | { status: 'duplicate'; message: string; shortUrl: string; expiresAt: string | null; waitLabel: string }
  | { status: 'error'; message: string };

type ShortenResponse = {
  error?: string;
  shortUrl?: string;
  expiresAt?: string | null;
  waitLabel?: string;
};

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isNotFoundPath(): boolean {
  return window.location.pathname !== '/';
}

function BrandLink({ domain }: { domain: string }) {
  return (
    <a className={styles.brandLine} href="/" aria-label="Go to shortener home">
      <img className={styles.logo} src="/design/assets/logo-mark.svg" alt="" />
      <span className={styles.wordmark}>{domain}</span>
    </a>
  );
}

export default function App() {
  const [longUrl, setLongUrl]               = useState('');
  const [expiryValue, setExpiryValue]       = useState('');
  const [expiryUnit, setExpiryUnit]         = useState<ExpiryUnit>('days');
  const [customCode, setCustomCode]         = useState('');
  const [state, setState]                   = useState<State>({ status: 'idle' });
  const [copied, setCopied]                 = useState(false);
  const [maxExpiryMonths, setMaxExpiryMonths] = useState(12);
  const inputRef                            = useRef<HTMLInputElement>(null);

  const domain = window.location.hostname;

  const expiryTooLong = expiryValue.trim() !== '' &&
    Number(expiryValue) * UNIT_TO_MS[expiryUnit] > maxExpiryMonths * UNIT_TO_MS.months;

  const customCodeInvalid = customCode.trim() !== '' && !CUSTOM_CODE_RE.test(customCode.trim());

  useEffect(() => {
    document.title = isNotFoundPath() ? `404 — ${domain}` : `${domain} — URL Shortener`;
  }, [domain]);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((d: { maxExpiryMonths?: number }) => {
        if (typeof d.maxExpiryMonths === 'number' && d.maxExpiryMonths > 0) {
          setMaxExpiryMonths(d.maxExpiryMonths);
        }
      })
      .catch(() => {});
  }, []);

  async function shorten() {
    const trimmed = longUrl.trim();
    if (!trimmed) return;

    setState({ status: 'loading' });
    setCopied(false);

    const body: Record<string, unknown> = { longUrl: trimmed };
    if (expiryValue.trim() !== '') {
      body.expiryValue = Number(expiryValue);
      body.expiryUnit  = expiryUnit;
    }
    if (customCode.trim() !== '') {
      body.customCode = customCode.trim();
    }

    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as ShortenResponse;

      if (!res.ok) {
        if (res.status === 429 && data.shortUrl) {
          setState({
            status: 'duplicate',
            message: data.error ?? 'This URL was already shortened recently.',
            shortUrl: data.shortUrl,
            expiresAt: data.expiresAt ?? null,
            waitLabel: data.waitLabel ?? 'a little longer',
          });
          return;
        }

        setState({ status: 'error', message: data.error ?? 'Something went wrong.' });
        return;
      }

      setState({
        status: 'success',
        shortUrl: data.shortUrl ?? '',
        expiresAt: data.expiresAt ?? null,
      });
    } catch {
      setState({ status: 'error', message: 'Could not reach the server. Try again.' });
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') shorten();
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navigator.clipboard requires a secure context (HTTPS/localhost).
      // Fall back to the legacy execCommand approach for plain-HTTP deployments.
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setLongUrl('');
    setExpiryValue('');
    setExpiryUnit('days');
    setCustomCode('');
    setState({ status: 'idle' });
    setCopied(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const isLoading = state.status === 'loading';

  if (isNotFoundPath()) {
    return (
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="page-title">
          <header className={styles.header}>
            <BrandLink domain={domain} />
            <p className={styles.kicker}>404</p>
            <h1 id="page-title" className={styles.title}>This short path does not exist.</h1>
            <p className={styles.tagline}>Check the address, or return to the shortener.</p>
          </header>
        </section>

        <section className={`${styles.card} ${styles.notFoundCard}`} aria-label="Page not found">
          <p className={styles.notFoundCode}>{window.location.pathname}</p>
          <p className={styles.notFoundText}>
            This page is not part of the configured shortener interface.
          </p>
          <a className={styles.homeLink} href="/">
            Go to shortener
          </a>
        </section>

        <footer className={styles.footer}>
          <span>All short links expire. Omit expiry to use the configured maximum.</span>
        </footer>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="page-title">
        <header className={styles.header}>
          <BrandLink domain={domain} />
          <p className={styles.kicker}>Self-hosted URL shortener</p>
          <h1 id="page-title" className={styles.title}>Short links, under your control.</h1>
          <p className={styles.tagline}>Paste a long URL. Get a short one.</p>
        </header>
      </section>

      <section className={styles.card} aria-label="Create a short URL">
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            className={styles.input}
            type="url"
            placeholder="https://example.com/very/long/url"
            value={longUrl}
            onChange={e => setLongUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            aria-label="Long URL to shorten"
            autoFocus
          />
          <button
            className={styles.button}
            onClick={shorten}
            disabled={isLoading || !longUrl.trim() || expiryTooLong || customCodeInvalid}
            aria-label="Shorten URL"
          >
            {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : 'Shorten'}
          </button>
        </div>

        <div className={styles.expiryRow}>
          <span className={styles.expiryLabel}>Expires in</span>
          <input
            className={styles.expiryInput}
            type="number"
            min="1"
            placeholder="none"
            value={expiryValue}
            onChange={e => setExpiryValue(e.target.value)}
            disabled={isLoading}
            aria-label="Expiry amount"
          />
          <select
            className={styles.expirySelect}
            value={expiryUnit}
            onChange={e => setExpiryUnit(e.target.value as ExpiryUnit)}
            disabled={isLoading || expiryValue.trim() === ''}
            aria-label="Expiry unit"
          >
            {EXPIRY_UNITS.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className={styles.customIdRow}>
          <span className={styles.expiryLabel}>Custom ID</span>
          <input
            className={styles.customIdInput}
            type="text"
            placeholder="optional"
            value={customCode}
            onChange={e => setCustomCode(e.target.value)}
            disabled={isLoading}
            aria-label="Custom short ID"
            maxLength={16}
          />
        </div>

        {expiryTooLong && (
          <p className={styles.error} role="alert">
            Maximum expiry is {maxExpiryMonths} month{maxExpiryMonths === 1 ? '' : 's'}.
          </p>
        )}

        {customCodeInvalid && (
          <p className={styles.error} role="alert">
            Custom ID must be 3–16 characters. Start and end with a letter or number; hyphens and underscores allowed in between.
          </p>
        )}

        {state.status === 'error' && (
          <p className={styles.error} role="alert">{state.message}</p>
        )}

        {(state.status === 'success' || state.status === 'duplicate') && (
          <div className={styles.result} role="region" aria-label="Shortened URL">
            {state.status === 'duplicate' && (
              <p className={styles.notice} role="alert">
                {state.message}
              </p>
            )}
            <span className={styles.resultLabel}>
              {state.status === 'duplicate' ? 'Most recent short URL' : 'Your short URL'}
            </span>
            <div className={styles.resultRow}>
              <a
                className={styles.shortUrl}
                href={state.shortUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {state.shortUrl}
              </a>
              <button
                className={styles.copyButton}
                onClick={() => copyToClipboard((state as Extract<State, { status: 'success' }>).shortUrl)}
                aria-label={copied ? 'Copied' : 'Copy to clipboard'}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {state.expiresAt && (
              <p className={styles.expiryNote}>
                Expires {formatExpiry(state.expiresAt)}
              </p>
            )}
            {state.status === 'duplicate' && (
              <p className={styles.expiryNote}>
                Wait about {state.waitLabel}, or until the existing short URL expires, to generate a unique new short URL for this address.
              </p>
            )}
            <button className={styles.resetLink} onClick={reset}>
              Shorten another
            </button>
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        <span>All short links expire. Omit expiry to use the configured maximum.</span>
      </footer>
    </main>
  );
}
