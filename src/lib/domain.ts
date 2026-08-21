/**
 * Domain parsing, in one place.
 *
 * The website is the single required input: it grounds the brand extraction and
 * the content lookup in one specific company, which a free-text company name
 * never could. "Acme" could be any of forty companies; acme.com is one.
 *
 * Deliberately dependency-free — the browser validates the field before submit
 * and the server re-validates on arrival, and neither should pull zod in to do
 * it.
 */

/**
 * A hostname with at least two labels and an alphabetic TLD. Rejects bare
 * words, IP addresses, and `localhost`, none of which identify a company.
 */
const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Second-level domains that carry no company name, so the label before them is
 * the one that does: `johnlewis.co.uk`, not `co`.
 */
const GENERIC_SLDS = new Set([
  'co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go',
]);

/** Subdomains that are never part of the company name. */
const IGNORED_SUBDOMAINS = new Set(['www', 'www2', 'shop', 'store', 'web']);

/**
 * Strips protocol, `www.`, path, query, and trailing slash, returning a bare
 * lowercase hostname — or null if the input is not a plausible domain.
 *
 * Accepts what people actually paste: `farmers.com`, `https://farmers.com/`,
 * `www.farmers.com/about?utm=x`.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let host: string;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host.startsWith('www.')) host = host.slice(4);
  return HOSTNAME.test(host) ? host : null;
}

/**
 * A first guess at the company name, from the domain.
 *
 * Deliberately a guess. `farmers.com` yields "Farmers" when the company is
 * Farmers Insurance, and `johndeere.com` yields "Johndeere" — the generation
 * step is told to correct it from the discovery notes or the site, and this is
 * only the fallback when it has nothing better.
 */
export function companyNameFromDomain(domain: string): string {
  const labels = domain.split('.').filter(Boolean);
  if (labels.length === 0) return domain;

  // Drop the TLD, plus a generic second-level domain if one sits before it.
  let significant = labels.slice(0, -1);
  if (
    significant.length > 1 &&
    GENERIC_SLDS.has(significant[significant.length - 1])
  ) {
    significant = significant.slice(0, -1);
  }

  // Drop leading subdomains that carry no name, but never the last label.
  while (significant.length > 1 && IGNORED_SUBDOMAINS.has(significant[0])) {
    significant = significant.slice(1);
  }

  const name = significant[significant.length - 1] ?? domain;

  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
