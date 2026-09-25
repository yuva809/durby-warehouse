import { isIP } from 'node:net';

/**
 * Parses TRUST_PROXY into the exact list of proxy addresses Express may
 * believe X-Forwarded-For from. Deliberately narrow: only literal IPs or
 * CIDR ranges are accepted — never `true`, hop counts, or Express's
 * keyword shortcuts ("loopback", "uniquelocal"), and never a /0 range —
 * because trusting more than the real reverse proxy lets any client forge
 * its own IP (and so dodge per-IP rate limits). Unset/empty => false, i.e.
 * X-Forwarded-For is ignored entirely and req.ip is the direct peer.
 * Throws on malformed input so a typo fails startup instead of silently
 * trusting (or not trusting) the wrong thing.
 */
export function parseTrustProxy(raw: string | undefined): string[] | false {
  const value = raw?.trim();
  if (!value) return false;

  const entries = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) return false;

  for (const entry of entries) {
    const parts = entry.split('/');
    const [addr, prefix] = parts;
    const family = isIP(addr);
    if (parts.length > 2 || family === 0) {
      throw new Error(`TRUST_PROXY entry "${entry}" is not a literal IP address or CIDR range.`);
    }
    if (prefix !== undefined) {
      const bits = Number(prefix);
      const max = family === 4 ? 32 : 128;
      if (!/^\d+$/.test(prefix) || bits < 1 || bits > max) {
        throw new Error(`TRUST_PROXY entry "${entry}" has an invalid prefix length (allowed: 1-${max}).`);
      }
    }
  }
  return entries;
}

/** Applies TRUST_PROXY to an Express-style app; returns what was applied (false = none). */
export function configureTrustProxy(app: { set(setting: string, value: unknown): unknown }, raw: string | undefined) {
  const trusted = parseTrustProxy(raw);
  app.set('trust proxy', trusted);
  return trusted;
}
