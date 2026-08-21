'use server';

import {
  NEUTRAL_BRAND,
  resolveBrand,
  type BrandOrigin,
  type LogoAsset,
} from '@/src/lib/brand';
import { companyNameFromDomain, normalizeDomain } from '@/src/lib/domain';
import { resolveDiscovery, type DiscoverySource } from '@/src/lib/discovery';
import { generatePackage } from '@/src/lib/generate-package';
import { addTerms, demoDomain, type CreatedTerm } from '@/src/lib/ovaledge/client';
import { toOvalEdgeTerms } from '@/src/lib/ovaledge/map-terms';
import { logUsage } from '@/src/lib/usage';
import { GlossarySchema, type Brand, type DemoPackage } from '@/src/lib/schema';

/**
 * The only place the Anthropic API is reached from. Everything it imports is
 * marked `server-only`, so a stray import from a client component fails the
 * build instead of leaking the key.
 */

/**
 * The website is the only required input. The company name is derived from it
 * rather than typed, so the two can never disagree — and the derivation lives
 * server-side so a client sending a mismatched pair is not possible.
 */
export interface GenerateRequest {
  domain: string;
  discovery: DiscoverySource;
}

export interface BrandResponse {
  brand: Brand;
  origin: BrandOrigin;
  note: string;
  /** Absent when the site had no usable logo, or had no site to read. */
  logo?: LogoAsset;
}

export type ContentResponse =
  | {
      ok: true;
      pkg: DemoPackage;
      attempts: number;
      /** USD for this generation, so the number is visible in the UI too. */
      costUsd: number;
    }
  | {
      ok: false;
      message: string;
      issues: string[];
      rawOutput?: string;
      /** A run that failed twice still spent tokens — arguably the ones that matter most. */
      costUsd?: number;
    };

/**
 * Brand extraction, as its own action.
 *
 * Split from content generation so the browser can show it finishing — it takes
 * about a second against a live site, while generation runs for a minute, and
 * collapsing them into one call made the fast half invisible. The client fires
 * both in parallel, so nothing waits on anything it did not before.
 *
 * Makes no Anthropic call: the palette is scraped from the company's site.
 */
export async function extractBrand(domain: string): Promise<BrandResponse> {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return {
      brand: NEUTRAL_BRAND,
      origin: 'fallback',
      note: `"${domain}" is not a usable website address; neutral palette applied.`,
    };
  }

  // resolveBrand never rejects — colour lookup must never block generation.
  const resolution = await resolveBrand(
    companyNameFromDomain(normalized),
    normalized,
  );
  return {
    brand: resolution.brand,
    origin: resolution.origin,
    note: resolution.note,
    logo: resolution.logo,
  };
}

/**
 * The homepage and glossary, from one Anthropic call.
 *
 * Returns the package carrying a stand-in palette; the caller swaps in whatever
 * `extractBrand` resolved. Content does not depend on the colours, which is what
 * lets the two run independently.
 */
export async function generateContent(
  request: GenerateRequest,
): Promise<ContentResponse> {
  const domain = normalizeDomain(request.domain);
  if (!domain) {
    return {
      ok: false,
      message: `"${request.domain}" is not a usable website address. Enter a domain such as farmers.com.`,
      issues: [],
    };
  }

  const companyName = companyNameFromDomain(domain);

  try {
    const discovery = await resolveDiscovery(request.discovery);
    const content = await generatePackage({ companyName, domain, discovery });

    // Logged on every path, including failures — a rejected generation still
    // spent tokens, and those are exactly the ones worth noticing.
    const label = `${companyName} (${discovery.notes ? 'notes' : 'no notes'}, ${content.attempts} attempt(s))`;
    const cost = logUsage(label, content.usage);

    if (!content.ok) {
      return {
        ok: false,
        message: `The generated JSON failed validation twice (${content.attempts} attempts).`,
        issues: content.issues,
        rawOutput: content.rawOutput,
        costUsd: cost.total,
      };
    }

    return {
      ok: true,
      pkg: content.pkg,
      attempts: content.attempts,
      costUsd: cost.total,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Generation failed for an unknown reason.',
      issues: [],
    };
  }
}

export type PublishResponse =
  | { ok: true; domain: string; created: CreatedTerm[] }
  | { ok: false; message: string; issues: string[] };

/**
 * Writes the glossary to OvalEdge. Only ever reached from an explicit click —
 * nothing in the generate path touches OvalEdge.
 *
 * The glossary arrives from the browser after the user has edited it, so it is
 * re-validated here rather than trusted. There is no retry: see
 * docs/ovaledge-api-notes.md on why a duplicate publish is worse than a visible
 * failure.
 */
export async function publishGlossary(
  glossary: unknown,
): Promise<PublishResponse> {
  const parsed = GlossarySchema.safeParse(glossary);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'The edited glossary is no longer valid, so nothing was published.',
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }

  try {
    const domain = demoDomain();
    const result = await addTerms(toOvalEdgeTerms(parsed.data, domain));

    console.log(
      `[publish] ${result.created.length} term(s) created in "${domain}": ${result.termIds.join(', ')}`,
    );

    return { ok: true, domain, created: result.created };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Publishing failed for an unknown reason.';
    console.error('[publish] failed:', error);
    return { ok: false, message, issues: [] };
  }
}
