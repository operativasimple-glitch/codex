import { log } from './log.js';

export class ApiError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch con reintentos y backoff exponencial.
 * Reintenta en 429 y 5xx, que es donde viven los rate limits de Shopify/Meta/TikTok.
 */
export async function request(url, options = {}, { retries = 4, label = 'api' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let body;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = retryAfter ? retryAfter * 1000 : Math.min(2 ** attempt * 1000, 16000);
        if (attempt < retries) {
          log.dim(`  ${label}: ${res.status}, reintento en ${wait / 1000}s (${attempt + 1}/${retries})`);
          await sleep(wait);
          continue;
        }
      }
      if (!res.ok) {
        throw new ApiError(`${label}: HTTP ${res.status}`, { status: res.status, body, url });
      }
      return body;
    } catch (e) {
      lastErr = e;
      const isNetwork = e instanceof TypeError || /fetch failed|ECONN|ETIMEDOUT/i.test(e.message || '');
      if (isNetwork && attempt < retries) {
        const wait = Math.min(2 ** attempt * 1000, 16000);
        log.dim(`  ${label}: fallo de red, reintento en ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export const qs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
    .join('&');
