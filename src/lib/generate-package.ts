import 'server-only';

import { z } from 'zod';

import {
  callClaude,
  contentGuidelines,
  extractJsonObject,
  messageText,
} from './anthropic.ts';
import { DemoPackageSchema, type Brand, type DemoPackage } from './schema.ts';
import { addUsage, emptyUsage, type UsageTotals } from './usage.ts';
import type { ResolvedDiscovery } from './discovery';

/**
 * Web searches Claude may run when it has no discovery notes to work from.
 * Each result is injected into context and re-sent on every later turn, so this
 * number multiplies through the whole call.
 */
const WEB_SEARCH_MAX_USES = 3;

/**
 * Turns a company + discovery context into a validated DemoPackage.
 *
 * The model produces JSON only — never HTML, and never a tag page id. Output is
 * validated against DemoPackageSchema; on failure it gets exactly one more go
 * with the Zod errors handed back to it. A second failure is surfaced, not
 * papered over: a homepage that quietly ignored the content guidelines is worse
 * than no homepage.
 */

const JSON_CONTRACT = `---

# Output contract

Return ONLY a JSON object. No prose, no explanation, no code fence.

{
  "homepage": {
    "cardPattern": "governance-focus" | "business-area",
    "hero": { "title": string, "tagline": string, "badge": string },
    "purpose": { "challenge": string, "solution": string },
    "cards": [ { "title": string, "description": string }, ... exactly 3 ],
    "quickAccessLinks": [ "search" | "glossary" | "marketplace" | "lineage" ],
    "footerStatement": string
  },
  "glossary": {
    "terms": [
      {
        "termName": string,
        "businessDescription": string,
        "detailDescription": string (optional),
        "isHeroMetric": boolean,
        "formula": string (optional),
        "components": string (optional),
        "commonMistakes": string (optional),
        "bestPractices": string (optional),
        "abbreviations": string (optional)
      }
    ]
  }
}

Hard rules, each enforced by a validator that will reject your output:
- Exactly 3 cards, with distinct titles. Title plus ONE short sentence each
  (200 characters or fewer). No bullets, no connector lists, no specs.
- "tagline" is 3 to 5 words. Separators like "•" do not count as words.
- "challenge" and "solution" are 250 characters or fewer EACH. Keep them tight —
  two lean paragraphs, not two essays.
- Plain text only. No HTML tags in any field; the markup is applied later.
- None of these phrases, in any field: "unlock value", "unleash insights",
  "democratize data", "revolutionize".
- "quickAccessLinks" is any subset of the four allowed values, in the order you
  want them rendered. Pick the ones the discovery context actually justifies.
- Do NOT emit a "tagHref" on any card. Tag page links are added by hand later,
  and a made-up tag id is worse than no link.

## Glossary rules

- 6 to 8 terms, with distinct names. These are the business terms this customer
  actually argues about — the ones the discovery context points at. Not generic
  data-governance vocabulary.
- "businessDescription": what the term means to the business, in their language.
  300 characters or fewer. Plain language, not a data dictionary entry.
- EXACTLY ONE term has "isHeroMetric": true. Every other term has false. The hero
  metric is the single number the demo walks through end to end — pick the one
  the discovery context suggests they argue about most.
- The hero metric MUST carry "formula", and should also carry "components",
  "commonMistakes", "bestPractices", and "abbreviations".
- Ordinary terms should NOT carry those five fields. A glossary where every term
  is exhaustively documented reads as generated. Leave them out.
- Never invent a capability claim about a named system. Naming where data lives
  is fine ("revenue is recorded in Snowflake"); claiming the platform integrates
  with, connects to, catalogs, or is certified for it is not — you have no way
  to know that, and the validator rejects it.
- Every glossary field is plain text and obeys the same buzzword ban as above.`;

function buildTaskPrompt(input: GenerateHomepageInput): string {
  const lines = [
    `Company: ${input.companyName}`,
    input.domain?.trim() ? `Website: ${input.domain.trim()}` : null,
    '',
    'Use web search to read the company\'s own website for business context —',
    'what they do, which business areas they run, the terminology they use.',
    'Weight the discovery notes above the website: the website informs',
    'terminology and industry, the discovery call decides what the page',
    'emphasizes.',
    '',
  ].filter((line): line is string => line !== null);

  if (input.discovery.notes) {
    lines.push('Discovery call notes:', '', input.discovery.notes);
  } else {
    lines.push(
      'There are NO discovery notes for this company. Work from the website',
      'alone and stay conservative — do not state customer-specific facts you',
      'cannot see, and do not invent a challenge they did not describe.',
    );
  }

  return lines.join('\n');
}

/** The model must not supply tag hrefs; those stay manual. */
function stripTagHrefs(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const root = value as { homepage?: { cards?: unknown } };
  const cards = root.homepage?.cards;
  if (Array.isArray(cards)) {
    for (const card of cards) {
      if (card && typeof card === 'object') {
        delete (card as { tagHref?: unknown }).tagHref;
      }
    }
  }
  return value;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
}

/**
 * DemoPackageSchema requires a palette in order to validate, but content
 * generation must not wait on the brand lookup. This stand-in satisfies the
 * schema during generation and is replaced by the resolved palette before the
 * package leaves the server action.
 */
const PLACEHOLDER_BRAND: Brand = {
  primary: '#2f6f9f',
  secondary: '#7a8b99',
  dark: '#1c2b36',
  light: '#eef2f5',
};

export interface GenerateHomepageInput {
  companyName: string;
  domain?: string;
  discovery: ResolvedDiscovery;
  /** Optional — defaults to a stand-in the caller is expected to replace. */
  brand?: Brand;
}

export type GenerateHomepageResult =
  | { ok: true; pkg: DemoPackage; attempts: number; usage: UsageTotals }
  | {
      ok: false;
      issues: string[];
      rawOutput: string;
      attempts: number;
      usage: UsageTotals;
    };

export async function generatePackage(
  input: GenerateHomepageInput,
): Promise<GenerateHomepageResult> {
  /**
   * Two blocks with the breakpoint on the second: `cache_control` caches
   * everything up to and including the block it sits on, so this caches the
   * guidelines and the contract together. The guidelines file alone is close to
   * the ~1024-token minimum cacheable prefix and might not qualify on its own.
   */
  const system = [
    { type: 'text' as const, text: contentGuidelines() },
    {
      type: 'text' as const,
      text: JSON_CONTRACT,
      cache_control: { type: 'ephemeral' as const },
    },
  ];

  /**
   * Notes are the context. When they exist, searching the web adds pages of
   * injected results that get re-sent every turn and displace the very notes
   * that should be driving the page.
   */
  const webSearchMaxUses = input.discovery.notes ? undefined : WEB_SEARCH_MAX_USES;

  const task = buildTaskPrompt(input);

  let prompt = task;
  let rawOutput = '';
  let issues: string[] = [];
  let usage = emptyUsage();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const call = await callClaude({
      system,
      webSearchMaxUses,
      messages: [{ role: 'user', content: prompt }],
    });
    usage = addUsage(usage, call.usage);
    rawOutput = messageText(call.message);

    try {
      const json = stripTagHrefs(extractJsonObject(rawOutput)) as {
        homepage?: unknown;
        glossary?: unknown;
      };

      // `prospect` is ours; `homepage` and `glossary` come from the model, in
      // one call — a second call would double the cached-prefix cost and let
      // the two halves drift away from the same discovery context.
      const candidate = {
        prospect: {
          name: input.companyName,
          brand: input.brand ?? PLACEHOLDER_BRAND,
        },
        homepage: json.homepage,
        glossary: json.glossary,
      };

      const parsed = DemoPackageSchema.safeParse(candidate);
      if (parsed.success) {
        return { ok: true, pkg: parsed.data, attempts: attempt, usage };
      }
      issues = formatIssues(parsed.error);
    } catch (error) {
      issues = [error instanceof Error ? error.message : String(error)];
    }

    // Second pass: same task, plus exactly what was wrong the first time.
    prompt = [
      task,
      '',
      'Your previous answer was rejected by the validator.',
      '',
      'Previous output:',
      rawOutput,
      '',
      'Validation errors:',
      ...issues.map((issue) => `- ${issue}`),
      '',
      'Return corrected JSON. Fix every error listed. Do not change fields that',
      'were not flagged, and do not add commentary.',
    ].join('\n');
  }

  return { ok: false, issues, rawOutput, attempts: 2, usage };
}
