'use server';

import { resolveBrand, type BrandOrigin } from '@/src/lib/brand';
import { resolveDiscovery, type DiscoverySource } from '@/src/lib/discovery';
import { generatePackage } from '@/src/lib/generate-package';
import { addTerms, demoDomain, type CreatedTerm } from '@/src/lib/ovaledge/client';
import { toOvalEdgeTerms } from '@/src/lib/ovaledge/map-terms';
import { logUsage } from '@/src/lib/usage';
import { GlossarySchema, type DemoPackage } from '@/src/lib/schema';

/**
 * The only place the Anthropic API is reached from. Everything it imports is
 * marked `server-only`, so a stray import from a client component fails the
 * build instead of leaking the key.
 */

export interface GenerateRequest {
  companyName: string;
  domain?: string;
  discovery: DiscoverySource;
}

export type GenerateResponse =
  | {
      ok: true;
      pkg: DemoPackage;
      brandOrigin: BrandOrigin;
      brandNote: string;
      attempts: number;
      /** USD for this generation, so the number is visible in the UI too. */
      costUsd: number;
    }
  | { ok: false; message: string; issues: string[]; rawOutput?: string };

export async function generateDemoPackage(
  request: GenerateRequest,
): Promise<GenerateResponse> {
  const companyName = request.companyName.trim();
  if (!companyName) {
    return { ok: false, message: 'Company name is required.', issues: [] };
  }

  try {
    const discovery = await resolveDiscovery(request.discovery);

    // Brand lookup and content generation are independent, so they run
    // together — and resolveBrand never rejects, so a failed color lookup can
    // never take the generation down with it.
    const [brandResolution, content] = await Promise.all([
      resolveBrand(companyName, request.domain),
      // No brand passed: content does not depend on the palette, and the
      // resolved one is swapped in below.
      generatePackage({ companyName, domain: request.domain, discovery }),
    ]);

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
      };
    }

    return {
      ok: true,
      pkg: {
        ...content.pkg,
        prospect: { ...content.pkg.prospect, brand: brandResolution.brand },
      },
      brandOrigin: brandResolution.origin,
      brandNote: brandResolution.note,
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
