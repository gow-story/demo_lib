import { z } from 'zod';

// Explicit extension: the check scripts load this module through Node's ESM
// resolver, which does not do extensionless resolution.
import { NAV_HREF } from './nav-href.ts';

/**
 * DemoPackage — the only thing the LLM produces.
 *
 * Shape comes from the "Schema implications for `DemoPackage`" section of
 * docs/homepage-content-guidelines.md. This module is the boundary between the
 * model's judgment and the fixed HTML in `src/templates/`: anything mechanically
 * checkable from the guidelines is enforced here, everything else (tone, whether
 * the card pattern was the right call) stays a judgment the model makes.
 */

/** Buzzwords called out in guideline 8. Matched case-insensitively. */
const BANNED_PHRASES = [
  'unlock value',
  'unleash insights',
  'democratize data',
  'revolutionize',
] as const;

/**
 * The model fills JSON fields and never writes markup (CLAUDE.md, architecture
 * rule). Anything that looks like a tag is a bug in the generation prompt, not
 * content to pass through to the template.
 */
const HTML_LIKE = /<[^>]*>/;

function containsBannedPhrase(value: string): string | undefined {
  const haystack = value.toLowerCase();
  return BANNED_PHRASES.find((phrase) => haystack.includes(phrase));
}

/**
 * Guideline 8: never invent connector support, deployment support,
 * certifications, or integrations.
 *
 * The failure mode this catches is real — an early run produced "delivers a
 * unified catalog across Snowflake, SQL Server, and Salesforce", which is a
 * connector claim nobody made. Naming a system is fine ("revenue data
 * originates in Snowflake"); claiming a capability *about* it is not, so a
 * violation needs a claim marker and a system name close together.
 */
const NAMED_SYSTEMS = [
  'snowflake', 'databricks', 'salesforce', 'sql server', 'oracle', 'redshift',
  'bigquery', 'tableau', 'power bi', 'sap', 'informatica', 'collibra',
  'alation', 'kafka', 'dbt', 'mongodb', 'postgres', 'mysql', 'teradata',
  'hadoop', 'azure', 'aws', 'gcp', 'looker', 'qlik', 'workday', 'netsuite',
  'servicenow', 'sharepoint', 'ovaledge',
] as const;

const CAPABILITY_MARKERS = [
  'integrat', 'connector', 'connects to', 'natively', 'native support',
  'out of the box', 'out-of-the-box', 'certified', 'seamless', 'plug and play',
  'plug-and-play', 'pre-built', 'prebuilt', 'syncs', 'sync with',
  'unified catalog', 'single catalog', 'catalog across', 'catalogs ',
  'governs ', 'works with', 'compatible with',
] as const;

/** How far apart a marker and a system name may sit and still count as a claim. */
const CLAIM_WINDOW = 50;

function containsCapabilityClaim(value: string): string | undefined {
  const haystack = value.toLowerCase();

  for (const system of NAMED_SYSTEMS) {
    let at = haystack.indexOf(system);
    while (at !== -1) {
      const window = haystack.slice(
        Math.max(0, at - CLAIM_WINDOW),
        at + system.length + CLAIM_WINDOW,
      );
      const marker = CAPABILITY_MARKERS.find((m) => window.includes(m));
      if (marker) return `"${marker.trim()}" near "${system}"`;
      at = haystack.indexOf(system, at + system.length);
    }
  }
  return undefined;
}

/** The three content guardrails every generated text field carries. */
function guarded<T extends z.ZodString>(schema: T) {
  return schema
    .refine(
      (v) => !HTML_LIKE.test(v),
      'must be plain text — all markup comes from src/templates/',
    )
    .refine((v) => containsBannedPhrase(v) === undefined, {
      error: (issue) =>
        `contains banned buzzword "${containsBannedPhrase(String(issue.input))}"`,
    })
    .refine((v) => containsCapabilityClaim(v) === undefined, {
      error: (issue) =>
        `reads as an invented capability claim — ${containsCapabilityClaim(String(issue.input))}. Name a system, but do not claim support for it.`,
    });
}

/** A single-line, plain-text field with a length ceiling. */
function plainText(max: number) {
  return guarded(
    z
      .string()
      .trim()
      .min(1, 'must not be empty')
      .max(max, `must be ${max} characters or fewer`),
  ).refine((v) => !v.includes('\n'), 'must be a single line');
}

/** A prose paragraph: plain text, but multi-sentence and longer. */
function paragraph(min: number, max: number) {
  return guarded(
    z
      .string()
      .trim()
      .min(min, `must be at least ${min} characters`)
      .max(max, `must be ${max} characters or fewer`),
  );
}

/**
 * Glossary prose. Same guardrails as `paragraph`, but newlines are allowed —
 * detail fields carry short labelled sections that end up in one OvalEdge
 * rich-text field.
 */
function richText(max: number) {
  return guarded(
    z
      .string()
      .trim()
      .min(1, 'must not be empty')
      .max(max, `must be ${max} characters or fewer`),
  );
}

/**
 * Guideline 3: pick one pattern, never blend them.
 * - `governance-focus` — what the customer wants to accomplish.
 * - `business-area` — what data the customer has.
 */
export const CardPatternSchema = z.enum(['governance-focus', 'business-area']);

/**
 * Guideline 4. The tagline is 3–5 words; separators used in sequence taglines
 * ("Discover • Classify • Trace • Govern") don't count as words.
 */
export const HeroSchema = z.object({
  title: plainText(80),
  tagline: plainText(60).refine((v) => {
    const words = v.replace(/[•·|/–—-]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return words.length >= 3 && words.length <= 5;
  }, 'must be 3–5 words (separators such as "•" are not counted)'),
  badge: plainText(120),
});

/**
 * Guideline 6: exactly two paragraphs — situation, then how it's addressed.
 * The 250-character cap is deliberate pressure on the generation step: real
 * paste tests came back too wordy, and there is no editing pass downstream.
 */
export const PURPOSE_PARAGRAPH_MAX = 250;

export const PurposeSchema = z.object({
  challenge: paragraph(80, PURPOSE_PARAGRAPH_MAX),
  solution: paragraph(80, PURPOSE_PARAGRAPH_MAX),
});

/**
 * An internal OvalEdge route. Query strings are allowed — tag pages look like
 * `#nav/tagsview?browse=tiles&id=1143&objectType=oetag&masterTagId=1063`.
 * Anything with a scheme (http:, https:, javascript:) fails the `#nav/` prefix.
 */
export const NavHrefSchema = z
  .string()
  .trim()
  .max(300, 'must be 300 characters or fewer')
  .regex(NAV_HREF, 'must be an internal #nav/... route');

/** Guideline 5: title plus one short sentence. No bullets, no specs. */
export const CardSchema = z.object({
  title: plainText(48),
  description: plainText(200).refine(
    (v) => !/^\s*[-*•]/.test(v),
    'must be a sentence, not a bullet list',
  ),
  /** Optional tag page. Absent means the card renders as plain text. */
  tagHref: NavHrefSchema.optional(),
});

/** The fixed OvalEdge destinations a homepage can link to from Quick Access. */
export const QuickAccessLinkSchema = z.enum([
  'search',
  'glossary',
  'marketplace',
  'lineage',
]);

/** `#rrggbb` or `#rgb`. */
export const HexColorSchema = z
  .string()
  .trim()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    'must be a hex color such as #0f6fb5',
  );

/**
 * The prospect's palette. These drive the template directly, which is why they
 * are validated as hex rather than left as free strings — an unparseable color
 * silently renders as no color at all in the Froala editor.
 */
export const BrandSchema = z.object({
  primary: HexColorSchema,
  secondary: HexColorSchema,
  dark: HexColorSchema,
  light: HexColorSchema,
});

export const ProspectSchema = z.object({
  name: plainText(80),
  brand: BrandSchema,
});

export const HomepageSchema = z.object({
  cardPattern: CardPatternSchema,
  hero: HeroSchema,
  purpose: PurposeSchema,
  cards: z
    .array(CardSchema)
    .length(3, 'must contain exactly 3 cards')
    .refine(
      (cards) =>
        new Set(cards.map((c) => c.title.toLowerCase())).size === cards.length,
      'card titles must be distinct',
    ),
  /** Rendered in the order given; only the listed destinations appear. */
  quickAccessLinks: z
    .array(QuickAccessLinkSchema)
    .refine(
      (links) => new Set(links).size === links.length,
      'quick access links must not repeat',
    ),
  /** Guideline 7: one short, conclusive sentence. */
  footerStatement: plainText(160),
});

/**
 * One business glossary term, destined for the OvalEdge term API.
 *
 * The five detail fields belong to the hero metric — the one term the demo
 * actually walks through. Ordinary terms carry a name and a business
 * description and stop there; over-detailing every term is what makes a
 * glossary look generated.
 */
export const GlossaryTermSchema = z.object({
  termName: plainText(60),
  businessDescription: richText(300),
  detailDescription: richText(1200).optional(),
  isHeroMetric: z.boolean(),
  /** How the metric is calculated. Required on the hero metric. */
  formula: richText(300).optional(),
  /** The inputs the formula draws on. */
  components: richText(600).optional(),
  commonMistakes: richText(800).optional(),
  bestPractices: richText(800).optional(),
  abbreviations: richText(300).optional(),
});

export const GLOSSARY_MIN_TERMS = 6;
export const GLOSSARY_MAX_TERMS = 8;

export const GlossarySchema = z.object({
  terms: z
    .array(GlossaryTermSchema)
    .min(GLOSSARY_MIN_TERMS, `must contain at least ${GLOSSARY_MIN_TERMS} terms`)
    .max(GLOSSARY_MAX_TERMS, `must contain at most ${GLOSSARY_MAX_TERMS} terms`)
    .refine(
      (terms) =>
        new Set(terms.map((t) => t.termName.trim().toLowerCase())).size ===
        terms.length,
      'term names must be distinct',
    )
    .refine((terms) => terms.filter((t) => t.isHeroMetric).length === 1, {
      error: (issue) =>
        `exactly one term must be the hero metric, found ${
          (issue.input as Array<{ isHeroMetric: boolean }>).filter(
            (t) => t.isHeroMetric,
          ).length
        }`,
    })
    .refine(
      (terms) => terms.every((t) => !t.isHeroMetric || Boolean(t.formula)),
      'the hero metric must carry a formula',
    ),
});

export const DemoPackageSchema = z.object({
  prospect: ProspectSchema,
  homepage: HomepageSchema,
  glossary: GlossarySchema,
});

export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;

export type HexColor = z.infer<typeof HexColorSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type Prospect = z.infer<typeof ProspectSchema>;
export type QuickAccessLink = z.infer<typeof QuickAccessLinkSchema>;
export type CardPattern = z.infer<typeof CardPatternSchema>;
export type Hero = z.infer<typeof HeroSchema>;
export type Purpose = z.infer<typeof PurposeSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Homepage = z.infer<typeof HomepageSchema>;
export type DemoPackage = z.infer<typeof DemoPackageSchema>;
