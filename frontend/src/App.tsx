import { useState, useRef, KeyboardEvent } from 'react';
import styles from './App.module.css';

type ExpiryUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

const EXPIRY_UNITS: ExpiryUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; shortUrl: string; expiresAt: string | null }
  | { status: 'error'; message: string };

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function App() {
  const [longUrl, setLongUrl]         = useState('');
  const [expiryValue, setExpiryValue] = useState('');
  const [expiryUnit, setExpiryUnit]   = useState<ExpiryUnit>('days');
  const [state, setState]             = useState<State>({ status: 'idle' });
  const [copied, setCopied]           = useState(false);
  const inputRef                      = useRef<HTMLInputElement>(null);

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

    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ status: 'error', message: data.error ?? 'Something went wrong.' });
        return;
      }

      setState({
        status: 'success',
        shortUrl: data.shortUrl,
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
    setState({ status: 'idle' });
    setCopied(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const isLoading = state.status === 'loading';

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <header className={styles.header}>
          <span className={styles.wordmark}>short.url</span>
          <p className={styles.tagline}>Paste a long URL. Get a short one.</p>
        </header>

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
            disabled={isLoading || !longUrl.trim()}
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
            placeholder="never"
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

        {state.status === 'error' && (
          <p className={styles.error} role="alert">{state.message}</p>
        )}

        {state.status === 'success' && (
          <div className={styles.result} role="region" aria-label="Shortened URL">
            <span className={styles.resultLabel}>Your short URL</span>
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
            <button className={styles.resetLink} onClick={reset}>
              Shorten another
            </button>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <span>Links without an expiry date never expire.</span>
      </footer>
    </main>
  );
}
