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
  "prospect": { "name": string },
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
        "componentTerms": string[] (hero metric only, 2-3 term names),
        "formula": string (optional),
        "components": string (optional),
        "commonMistakes": string (optional),
        "bestPractices": string (optional),
        "abbreviations": string (optional)
      }
    ]
  }
}

## The company name

"prospect.name" is the company's name as it should appear on the page. You are
given a name derived mechanically from the domain, which is often incomplete —
"farmers.com" derives as "Farmers" when the company is Farmers Insurance, and
"johndeere.com" derives as "Johndeere".

Correct it when the discovery notes or the site make the real name clear. Return
the derived name unchanged when they do not. Do NOT guess at a fuller name you
have not actually seen, and do not append "Inc", "Ltd", or a tagline.

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

## Glossary rules

- 6 to 8 terms, with distinct names. These are the business terms this customer
  actually argues about — the ones the discovery context points at. Not generic
  data-governance vocabulary.
- "businessDescription": what the term means to the business, in their language.
  300 characters or fewer. Plain language, not a data dictionary entry.
- EXACTLY ONE term has "isHeroMetric": true. Every other term has false.

## Designing the glossary around the hero metric

The hero metric is a DERIVED metric, and the terms it is derived from are also
terms in this glossary. That is what makes the demo tell a story: here is a
number, and here is what it is built from.

Worked example. Hero metric "Fuel Margin", derived from two other terms that are
themselves defined in the same glossary:

  "Fuel Margin"    isHeroMetric: true
                   componentTerms: ["Fuel Revenue", "Fuel Expenses"]
                   formula: "Fuel Margin = Fuel Revenue - Fuel Expenses"
  "Fuel Revenue"   isHeroMetric: false
  "Fuel Expenses"  isHeroMetric: false

Design it in this order, or you will not get a coherent result:
1. Choose a derived metric this customer actually argues about — one built from
   other quantities, not a standalone count.
2. Decide the 2 or 3 quantities it is derived from.
3. Write those quantities as full glossary terms, with their own names and
   business descriptions.
4. Write the hero metric, listing those exact term names in "componentTerms" and
   using them by name in "formula".
5. Fill the remaining slots with other terms this customer cares about.

Do NOT pick a term first and invent components for it afterwards.

Hard requirements the validator enforces:
- Every name in "componentTerms" must exactly match the "termName" of another
  term in this same glossary. A component naming a term you did not define is
  rejected.
- "componentTerms" holds 2 or 3 names, all distinct, and never the hero metric
  itself.
- Only the hero metric carries "componentTerms".
- "formula" must reference every component term by name, spelled the same way.
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
    `Website: ${input.domain}`,
    `Company name derived from the domain: ${input.companyName}`,
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
  /** The derived name, used as a seed and as the fallback. */
  companyName: string;
  /** Normalized hostname. Required — it is what grounds the whole lookup. */
  domain: string;
  discovery: ResolvedDiscovery;
  /** Optional — defaults to a stand-in the caller is expected to replace. */
  brand?: Brand;
}

/**
 * The model may correct the derived company name, but it does not get to put
 * arbitrary text in the hero title. Anything malformed falls back to the name
 * derived from the domain, which is always safe.
 */
function pickCompanyName(fromModel: unknown, derived: string): string {
  if (typeof fromModel !== 'string') return derived;
  const candidate = fromModel.trim();
  if (!candidate || candidate.length > 80) return derived;
  if (candidate.includes('\n') || /<[^>]*>/.test(candidate)) return derived;
  return candidate;
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
      const json = extractJsonObject(rawOutput) as {
        prospect?: { name?: unknown };
        homepage?: unknown;
        glossary?: unknown;
      };

      // `homepage`, `glossary`, and a possibly-corrected company name come from
      // the model, in one call — a second call would double the cached-prefix
      // cost and let the halves drift from the same discovery context. The
      // palette is ours, and so is the last word on the name.
      const candidate = {
        prospect: {
          name: pickCompanyName(json.prospect?.name, input.companyName),
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
