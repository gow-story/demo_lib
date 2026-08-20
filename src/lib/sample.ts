import type { DemoPackage } from './schema';

/**
 * A hand-written DemoPackage used as a fixture for schema and template work.
 *
 * Harborline Logistics is fictional — guideline 8 forbids stating
 * customer-specific facts that aren't in discovery notes, so a checked-in
 * sample must not invent them about a real prospect.
 *
 * Pattern: governance-focus (the notes it imitates are capability questions —
 * classification, lineage, scaling a small team — not a map of business areas).
 */
export const sampleDemoPackage: DemoPackage = {
  homepage: {
    cardPattern: 'governance-focus',
    hero: {
      title: 'Harborline Logistics Data Governance Hub',
      tagline: 'Discover • Classify • Trace • Govern',
      badge: 'One governed view of shipment, customer, and fleet data',
    },
    purpose: {
      challenge:
        'Harborline runs shipment, customer, and fleet data across a warehouse, three regional operational systems, and a long tail of spreadsheets that regional teams maintain themselves. Analysts spend more time confirming which figure is current than acting on it, and a four-person data team fields the same definition questions every quarter.',
      solution:
        'This environment gives Harborline one place to find a data set, see who owns it, and follow it back to the system it came from. Classification and lineage run against the sources already in place, so the small central team sets the standard once and regional analysts answer their own questions against it.',
    },
    cards: [
      {
        title: 'Data Discovery & Literacy',
        description:
          'Analysts search across warehouse and regional systems and see the owner, definition, and freshness of what they find.',
      },
      {
        title: 'Governance at Scale',
        description:
          'A four-person team sets classification and ownership rules once and applies them across every connected source.',
      },
      {
        title: 'AI-Ready Trusted Data',
        description:
          'Business context and lineage travel with each data set, so downstream models draw on data whose origin is known.',
      },
    ],
    footerStatement:
      'A governed foundation Harborline can extend as more regional data comes under management.',
  },
};
