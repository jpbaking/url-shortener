const DEFAULT_SCHEME = 'http';
const DEFAULT_SHORT_DOMAIN = 'short.url';

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function getShortDomain(): string {
  return envOrDefault(process.env.SHORT_DOMAIN, DEFAULT_SHORT_DOMAIN);
}

export function getScheme(): string {
  return envOrDefault(process.env.S_SCHEME, DEFAULT_SCHEME);
}

export function getRedirectHost(): string {
  return envOrDefault(process.env.S_DOMAIN, getShortDomain());
}

export function getRedirectBaseUrl(): string {
  return `${getScheme()}://${getRedirectHost()}`;
}

export function getHomeUrl(): string {
  return `${getScheme()}://${getShortDomain()}`;
}
