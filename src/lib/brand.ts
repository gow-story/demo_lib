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

function toUrl(domain: string): URL | null {
  const trimmed = domain.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // The domain arrives from a form field — don't let it point at the host.
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return null;
    }
    return url;
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

    const sheets = await Promise.all(
      stylesheetUrls(html, url).map((sheet) =>
        fetchText(sheet, STYLESHEET_TIMEOUT_MS).catch(() => ''),
      ),
    );

    const ranked = rankColors([html, ...sheets].join('\n'));
    const { brand, filled } = assignRoles(ranked);

    if (filled === 0) {
      return {
        brand: NEUTRAL_BRAND,
        origin: 'fallback',
        note: `No usable hex colors found on ${url.hostname}; neutral palette applied.`,
      };
    }

    return {
      brand,
      origin: 'site-extraction',
      note: `${filled} of 4 roles filled from ${ranked.length} colors found on ${url.hostname}${
        filled < 4 ? '; the rest are neutral defaults' : ''
      }.`,
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
