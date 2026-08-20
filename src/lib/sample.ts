import type { DemoPackage } from './schema';

/**
 * A hand-written DemoPackage used as a fixture for schema and template work.
 *
 * Harborline Logistics is fictional — guideline 8 forbids stating
 * customer-specific facts that aren't in discovery notes, so a checked-in
 * sample must not invent them about a real prospect. The brand hex values and
 * the tag page ids below are fixture values for the same reason.
 *
 * Pattern: governance-focus (the notes it imitates are capability questions —
 * classification, lineage, scaling a small team — not a map of business areas).
 */
export const sampleDemoPackage: DemoPackage = {
  prospect: {
    name: 'Harborline Logistics',
    brand: {
      primary: '#0f6fb5',
      secondary: '#f2a71b',
      dark: '#0b2b45',
      light: '#eef4f9',
    },
  },
  homepage: {
    cardPattern: 'governance-focus',
    hero: {
      title: 'Harborline Logistics Data Governance Hub',
      tagline: 'Discover • Classify • Trace • Govern',
      badge: 'One governed view of shipment, customer, and fleet data',
    },
    purpose: {
      challenge:
        'Harborline shipment, customer, and fleet data sits across a warehouse, three regional systems, and spreadsheets each region keeps itself. Analysts spend longer confirming which number is current than acting on it.',
      solution:
        'This environment gives Harborline one place to find a data set, see who owns it, and trace it back to its source system. A four-person team sets the standard once, and regional analysts work against it.',
    },
    cards: [
      {
        title: 'Data Discovery & Literacy',
        description:
          'Analysts search across warehouse and regional systems and see the owner, definition, and freshness of what they find.',
        tagHref:
          '#nav/tagsview?browse=tiles&id=1143&objectType=oetag&masterTagId=1063',
      },
      {
        title: 'Governance at Scale',
        description:
          'A four-person team sets classification and ownership rules once and applies them across every connected source.',
        tagHref:
          '#nav/tagsview?browse=tiles&id=1147&objectType=oetag&masterTagId=1063',
      },
      {
        // No tagHref — this card must render as plain text, not a dead link.
        title: 'AI-Ready Trusted Data',
        description:
          'Business context and lineage travel with each data set, so downstream models draw on data whose origin is known.',
      },
    ],
    quickAccessLinks: ['search', 'glossary', 'lineage'],
    footerStatement:
      'A governed foundation Harborline can extend as more regional data comes under management.',
  },
};
