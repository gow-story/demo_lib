'use server';

import { resolveBrand, type BrandOrigin } from '@/src/lib/brand';
import { resolveDiscovery, type DiscoverySource } from '@/src/lib/discovery';
import { generateHomepage } from '@/src/lib/generate-homepage';
import { logUsage } from '@/src/lib/usage';
import type { DemoPackage } from '@/src/lib/schema';

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
      generateHomepage({ companyName, domain: request.domain, discovery }),
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
