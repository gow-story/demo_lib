import type { Glossary, GlossaryTerm } from '../schema.ts';
import type { OvalEdgeTerm } from './client.ts';

/**
 * Maps generated glossary terms onto the OvalEdge term payload.
 *
 * Pure and dependency-free so the check script can exercise it without a
 * network or an API token.
 *
 * OvalEdge has no field for a formula, its components, mistakes, practices, or
 * abbreviations — so those fold into `detailDescription` as labelled sections.
 * That is why the hero metric's extra fields exist as separate schema fields at
 * all: they are separate while the model writes them and while the SE edits
 * them, and only merge at the boundary.
 */

const DETAIL_SECTIONS: Array<{ key: keyof GlossaryTerm; label: string }> = [
  { key: 'formula', label: 'Formula' },
  { key: 'components', label: 'Components' },
  { key: 'commonMistakes', label: 'Common mistakes' },
  { key: 'bestPractices', label: 'Best practices' },
  { key: 'abbreviations', label: 'Abbreviations' },
];

export function buildDetailDescription(term: GlossaryTerm): string | undefined {
  const sections: string[] = [];

  if (term.detailDescription?.trim()) {
    sections.push(term.detailDescription.trim());
  }

  for (const { key, label } of DETAIL_SECTIONS) {
    const value = term[key];
    if (typeof value === 'string' && value.trim()) {
      sections.push(`${label}\n${value.trim()}`);
    }
  }

  return sections.length ? sections.join('\n\n') : undefined;
}

export function toOvalEdgeTerms(
  glossary: Glossary,
  domainName: string,
): OvalEdgeTerm[] {
  return glossary.terms.map((term) => {
    const detailDescription = buildDetailDescription(term);

    // Note what is absent: no `category` (cannot be created via the API), and
    // no steward/owner/custodian (auto-filled from the token identity).
    const payload: OvalEdgeTerm = {
      domainName,
      termName: term.termName.trim(),
      businessDescription: term.businessDescription.trim(),
      action: 'add',
    };

    if (detailDescription) payload.detailDescription = detailDescription;

    return payload;
  });
}
