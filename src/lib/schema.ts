import { z } from 'zod';

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

/** A single-line, plain-text field with a length ceiling. */
function plainText(max: number) {
  return z
    .string()
    .trim()
    .min(1, 'must not be empty')
    .max(max, `must be ${max} characters or fewer`)
    .refine(
      (v) => !HTML_LIKE.test(v),
      'must be plain text — all markup comes from src/templates/',
    )
    .refine((v) => !v.includes('\n'), 'must be a single line')
    .refine((v) => containsBannedPhrase(v) === undefined, {
      error: (issue) =>
        `contains banned buzzword "${containsBannedPhrase(String(issue.input))}"`,
    });
}

/** A prose paragraph: plain text, but multi-sentence and longer. */
function paragraph(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, `must be at least ${min} characters`)
    .max(max, `must be ${max} characters or fewer`)
    .refine(
      (v) => !HTML_LIKE.test(v),
      'must be plain text — all markup comes from src/templates/',
    )
    .refine((v) => containsBannedPhrase(v) === undefined, {
      error: (issue) =>
        `contains banned buzzword "${containsBannedPhrase(String(issue.input))}"`,
    });
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

/** Guideline 6: exactly two paragraphs — situation, then how it's addressed. */
export const PurposeSchema = z.object({
  challenge: paragraph(80, 700),
  solution: paragraph(80, 700),
});

/** Guideline 5: title plus one short sentence. No bullets, no specs. */
export const CardSchema = z.object({
  title: plainText(48),
  description: plainText(200).refine(
    (v) => !/^\s*[-*•]/.test(v),
    'must be a sentence, not a bullet list',
  ),
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
  /** Guideline 7: one short, conclusive sentence. */
  footerStatement: plainText(160),
});

export const DemoPackageSchema = z.object({
  homepage: HomepageSchema,
});

export type CardPattern = z.infer<typeof CardPatternSchema>;
export type Hero = z.infer<typeof HeroSchema>;
export type Purpose = z.infer<typeof PurposeSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Homepage = z.infer<typeof HomepageSchema>;
export type DemoPackage = z.infer<typeof DemoPackageSchema>;
