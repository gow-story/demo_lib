import 'server-only';

import type { Brand } from './schema.ts';

/**
 * Brand resolution — no model call.
 *
 * Fetches the company's site, scrapes hex colors out of the markup and its
 * stylesheets, ranks them by frequency, and maps the winners onto the four
 * template roles. This used to be a web-search API call; it was the single most
 * expensive part of a generation and a page's palette does not need a language
 * model to find it.
 *
 * The signature and the never-rejects contract are unchanged: every failure
 * path lands on a usable palette.
 */

/** Used when extraction finds nothing, or cannot run at all. */
export const NEUTRAL_BRAND: Brand = {
  primary: '#2f6f9f',
  secondary: '#7a8b99',
  dark: '#1c2b36',
  light: '#eef2f5',
};

export type BrandOrigin =
  /** At least one role was filled from colors found on the site. */
  | 'site-extraction'
  /** Nothing usable — the hardcoded neutral palette. */
  | 'fallback';

export interface BrandResolution {
  brand: Brand;
  origin: BrandOrigin;
  /** One line explaining where the palette came from, shown in the UI. */
  note: string;
  /** The company's logo, when one could be found. Always optional. */
  logo?: LogoAsset;
}

const PAGE_TIMEOUT_MS = 8000;
const STYLESHEET_TIMEOUT_MS = 5000;
const MAX_STYLESHEETS = 3;
const MAX_BYTES = 2_000_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; demo-lib/1.0; +brand palette extraction)';

/**
 * `#rgb` or `#rrggbb`, not part of a longer hex run, and not an id selector
 * (`#header {`). Colors written as `rgb()`, `hsl()`, or a CSS custom property
 * are not picked up — hex covers the large majority in practice.
 */
const HEX_IN_CSS = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])(?!\s*\{)/g;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function toRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio against white. `primary` is rendered as text on a white
 * card, so 4.5 (the AA bar for normal text) is the floor — a merely "not light"
 * brand color still reads as washed out at 14px.
 */
function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** 0 for any grey, approaching 1 for a fully saturated color. */
function saturation(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function normalizeHex(raw: string): string {
  const body = raw.slice(1).toLowerCase();
  return body.length === 3
    ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
    : `#${body}`;
}

/** Hex colors in the text, most frequent first. */
function rankColors(text: string): string[] {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(HEX_IN_CSS)) {
    const hex = normalizeHex(match[0]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

/**
 * Public http(s) only. The domain arrives from a form field, and logo
 * candidates come from markup on that page — neither should be able to point
 * the server at its own network.
 */
function isPublicHttpUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return !(
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  );
}

function toUrl(domain: string): URL | null {
  const trimmed = domain.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return isPublicHttpUrl(url) ? url : null;
  } catch {
    return null;
  }
}

async function fetchText(url: URL, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/css,*/*' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`${url.hostname} responded ${response.status}`);
  }
  return (await response.text()).slice(0, MAX_BYTES);
}

/* ------------------------------------------------------------------ *
 * Logo discovery
 *
 * Best effort, and strictly optional: every failure path here returns
 * null, and the palette — and the generation running alongside it — is
 * unaffected either way.
 * ------------------------------------------------------------------ */

/**
 * Where a candidate came from, in search order, best first.
 *
 * `og:image` is last on purpose. It is usually a social share card sized for a
 * link preview rather than a mark — stripe.com returns a 305 KB JPEG banner —
 * and the template puts this in a 190px slot. The touch icon and the favicon
 * are almost always the actual logo, so they go first even though they are
 * smaller. Reordering this array is all it takes to change the priority.
 */
const LOGO_SOURCES = ['apple-touch-icon', 'favicon', 'og:image'] as const;
export type LogoSource = (typeof LOGO_SOURCES)[number];

export interface LogoAsset {
  /**
   * The image inlined as a data: URI. Fetched server-side rather than handed
   * to the browser as a URL so that it renders without a cross-origin request,
   * and so `<a download>` actually downloads instead of navigating — the
   * download attribute is ignored on cross-origin hrefs.
   */
  dataUri: string;
  /** Where it came from, for the "is this really the logo?" question. */
  sourceUrl: string;
  contentType: string;
  bytes: number;
  from: LogoSource;
}

interface LogoCandidate {
  url: URL;
  from: LogoSource;
  /** Lower is better. */
  sourceRank: number;
  formatRank: number;
  /** Largest declared dimension, 0 when unknown. */
  size: number;
}

const LOGO_TIMEOUT_MS = 5000;
const MAX_LOGO_ATTEMPTS = 4;
/** Base64 inflates by a third, and this rides in a server action response. */
const MAX_LOGO_BYTES = 512_000;

/** SVG and PNG first, ICO last. */
function formatRank(url: URL): number {
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.svg')) return 0;
  if (path.endsWith('.png')) return 1;
  if (path.endsWith('.webp')) return 2;
  if (path.endsWith('.ico')) return 5;
  if (path.endsWith('.gif')) return 4;
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 3;
  return 3;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
}

/** Largest edge from a `sizes` attribute; "any" (usually SVG) sorts high. */
function declaredSize(tag: string): number {
  const sizes = attr(tag, 'sizes');
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return 1024;
  return Math.max(0, ...[...sizes.matchAll(/(\d+)/g)].map((m) => Number(m[1])));
}

function pushCandidate(
  into: LogoCandidate[],
  href: string | undefined,
  base: URL,
  from: LogoSource,
  size: number,
) {
  if (!href?.trim()) return;
  try {
    const url = new URL(href.trim(), base);
    if (!isPublicHttpUrl(url)) return;
    into.push({
      url,
      from,
      sourceRank: LOGO_SOURCES.indexOf(from),
      formatRank: formatRank(url),
      size,
    });
  } catch {
    // Malformed href — skip it.
  }
}

/**
 * Candidates in the order they should be tried: by source first (see
 * `LOGO_SOURCES`), and within a source by format and declared size.
 */
function logoCandidates(html: string, base: URL): LogoCandidate[] {
  const candidates: LogoCandidate[] = [];

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url') {
      pushCandidate(candidates, attr(tag, 'content'), base, 'og:image', 0);
    }
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    if (!/\bicon\b/.test(rel)) continue;
    const from: LogoSource = rel.includes('apple-touch-icon')
      ? 'apple-touch-icon'
      : 'favicon';
    pushCandidate(candidates, attr(tag, 'href'), base, from, declaredSize(tag));
  }

  // Last resort: the conventional location, whether or not it is declared.
  pushCandidate(candidates, '/favicon.ico', base, 'favicon', 0);

  return candidates.sort(
    (a, b) =>
      a.sourceRank - b.sourceRank ||
      a.formatRank - b.formatRank ||
      b.size - a.size,
  );
}

/** Fetches the first candidate that turns out to be a usable image. */
async function fetchLogo(candidates: LogoCandidate[]): Promise<LogoAsset | null> {
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.size >= MAX_LOGO_ATTEMPTS) break;
    const key = candidate.url.toString();
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const response = await fetch(candidate.url, {
        headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
        signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) continue;

      const contentType =
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!contentType.startsWith('image/')) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) continue;

      return {
        dataUri: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`,
        sourceUrl: key,
        contentType,
        bytes: bytes.byteLength,
        from: candidate.from,
      };
    } catch {
      // Timeout, DNS failure, bad TLS — try the next candidate.
    }
  }

  return null;
}

/** Same-origin stylesheets linked from the page, capped. */
function stylesheetUrls(html: string, base: URL): URL[] {
  const urls: URL[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      const url = new URL(href, base);
      if (url.origin === base.origin) urls.push(url);
    } catch {
      // Malformed href — skip it.
    }
    if (urls.length >= MAX_STYLESHEETS) break;
  }
  return urls;
}

/**
 * Maps ranked colors onto the four roles.
 *
 * Straight top-four-by-frequency would routinely put a pale color in `dark`,
 * where the template paints white text on it. So frequency picks the winner
 * *within* each role, and each role only considers colors that can actually do
 * its job. A role with no candidate keeps its neutral default.
 */
function assignRoles(ranked: string[]): { brand: Brand; filled: number } {
  const brand: Brand = { ...NEUTRAL_BRAND };
  const used = new Set<string>();
  let filled = 0;

  const take = (predicate: (hex: string) => boolean): string | null => {
    const hex = ranked.find((c) => !used.has(c) && predicate(c));
    if (hex) used.add(hex);
    return hex ?? null;
  };

  // Hero background: white text sits on this.
  const dark = take((hex) => luminance(hex) <= 0.15);
  // Panel tint: dark body text sits on this. Pure white is allowed only if
  // nothing softer is available — it makes the panel disappear.
  const light =
    take((hex) => luminance(hex) >= 0.82 && luminance(hex) <= 0.985) ??
    take((hex) => luminance(hex) >= 0.82);
  // Card titles and links, on white: prefer a chromatic color that clears AA,
  // then any color that clears AA, before giving up on the role.
  const primary =
    take((hex) => contrastWithWhite(hex) >= 4.5 && saturation(hex) >= 0.15) ??
    take((hex) => contrastWithWhite(hex) >= 4.5);
  // Accent rule above each card.
  const secondary =
    take((hex) => saturation(hex) >= 0.15) ??
    take((hex) => luminance(hex) > 0.15 && luminance(hex) < 0.82);

  for (const [role, hex] of [
    ['dark', dark],
    ['light', light],
    ['primary', primary],
    ['secondary', secondary],
  ] as const) {
    if (hex) {
      brand[role] = hex;
      filled++;
    }
  }

  return { brand, filled };
}

export async function resolveBrand(
  companyName: string,
  domain?: string,
): Promise<BrandResolution> {
  const url = toUrl(domain ?? '');
  if (!url) {
    return {
      brand: NEUTRAL_BRAND,
      origin: 'fallback',
      note: domain?.trim()
        ? `Could not use "${domain.trim()}" as a website address; neutral palette applied.`
        : `No website given for ${companyName}, so colors could not be extracted. Add a domain, or set the swatches by hand.`,
    };
  }

  try {
    const html = await fetchText(url, PAGE_TIMEOUT_MS);

    // The logo is a bonus, never a dependency: its own catch, so a slow CDN or
    // a 404 favicon cannot cost us the palette we already have.
    const [sheets, logo] = await Promise.all([
      Promise.all(
        stylesheetUrls(html, url).map((sheet) =>
          fetchText(sheet, STYLESHEET_TIMEOUT_MS).catch(() => ''),
        ),
      ),
      fetchLogo(logoCandidates(html, url)).catch(() => null),
    ]);

    const ranked = rankColors([html, ...sheets].join('\n'));
    const { brand, filled } = assignRoles(ranked);

    if (filled === 0) {
      return {
        brand: NEUTRAL_BRAND,
        origin: 'fallback',
        note: `No usable hex colors found on ${url.hostname}; neutral palette applied.`,
        logo: logo ?? undefined,
      };
    }

    return {
      brand,
      origin: 'site-extraction',
      note: `${filled} of 4 roles filled from ${ranked.length} colors found on ${url.hostname}${
        filled < 4 ? '; the rest are neutral defaults' : ''
      }.`,
      logo: logo ?? undefined,
    };
  } catch (error) {
    // Swallowed on purpose: a failed palette degrades branding, it does not
    // invalidate the content. Never block generation on color lookup.
    console.error('[resolveBrand] extraction failed:', error);
    return {
      brand: NEUTRAL_BRAND,
      origin: 'fallback',
      note: `Could not read ${url.hostname}; neutral palette applied. Edit the swatches below.`,
    };
  }
}
