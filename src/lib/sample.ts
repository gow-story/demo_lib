import type { DemoPackage } from './schema';

/**
 * A hand-written DemoPackage used as a fixture for schema and template work.
 *
 * Harborline Logistics is fictional — guideline 8 forbids stating
 * customer-specific facts that aren't in discovery notes, so a checked-in
 * sample must not invent them about a real prospect. The brand hex values are
 * fixture values for the same reason.
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
    quickAccessLinks: ['search', 'glossary', 'lineage'],
    footerStatement:
      'A governed foundation Harborline can extend as more regional data comes under management.',
  },
  glossary: {
    // The hero metric is derived from two other terms defined here, which is
    // the point: the demo walks from a number down into what it is built from.
    terms: [
      {
        termName: 'Freight Margin',
        businessDescription:
          'What is left from freight revenue once the cost of moving the shipment is taken out. The number regional managers are held to, and the one they most often disagree about.',
        detailDescription:
          'Measured per lane and per period. A shipment counts in the period it was delivered, not the period it was booked.',
        isHeroMetric: true,
        componentTerms: ['Freight Revenue', 'Freight Cost'],
        formula: 'Freight Margin = Freight Revenue - Freight Cost',
        components:
          'Freight Revenue: billed amount for the shipment, net of credits.\nFreight Cost: carrier charges, fuel surcharge, and accessorials for the same shipment.',
        commonMistakes:
          'Booking revenue in the period a shipment was sold and cost in the period it moved, which flatters whichever period is being reported.\nExcluding accessorial charges from cost because they arrive on a separate invoice.\nComparing margin across regions before agreeing which surcharges belong in cost.',
        bestPractices:
          'Report margin alongside the shipment count behind it — a healthy margin over forty shipments is not comparable to one over four thousand.\nAgree the treatment of fuel surcharge before comparing lanes.',
        abbreviations: 'FM',
      },
      {
        termName: 'Freight Revenue',
        businessDescription:
          'The amount billed to the customer for moving a shipment, net of credits and rebates. One of the two inputs to Freight Margin.',
        isHeroMetric: false,
      },
      {
        termName: 'Freight Cost',
        businessDescription:
          'What it cost to move a shipment: carrier charges, fuel surcharge, and accessorials. The other input to Freight Margin.',
        isHeroMetric: false,
      },
      {
        termName: 'On-Time Delivery Rate',
        businessDescription:
          'The share of shipments arriving within the window promised at booking, measured against the original promise rather than any later revision.',
        isHeroMetric: false,
      },
      {
        termName: 'Promised Delivery Window',
        businessDescription:
          'The delivery date range quoted to the customer when a shipment is booked. It is the baseline every on-time measure is judged against.',
        isHeroMetric: false,
      },
      {
        termName: 'Active Customer',
        businessDescription:
          'A customer account with at least one booked shipment in the trailing twelve months. Regions have historically applied different windows, which is why the definition is stated here.',
        isHeroMetric: false,
      },
      {
        termName: 'Lane',
        businessDescription:
          'A recurring origin and destination pair that shipments are grouped into for pricing and performance reporting.',
        isHeroMetric: false,
      },
      {
        termName: 'Data Owner',
        businessDescription:
          'The named person accountable for a data set: what it means, who may use it, and whether it is fit to report on.',
        isHeroMetric: false,
      },
    ],
  },
};
