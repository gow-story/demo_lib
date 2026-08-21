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
  glossary: {
    terms: [
      {
        termName: 'On-Time Delivery Rate',
        businessDescription:
          'The share of shipments that arrive within the window promised to the customer at booking. The number regional managers are measured on, and the one they most often disagree about.',
        detailDescription:
          'Measured against the promised delivery window captured at booking, not against any later revision. A shipment rebooked after a delay counts against the original promise.',
        isHeroMetric: true,
        formula:
          'On-Time Delivery Rate = (Shipments Delivered Within Promised Window / Total Shipments Delivered) x 100',
        components:
          'Shipments Delivered Within Promised Window: delivery timestamp on or before the promised window close.\nTotal Shipments Delivered: all shipments with a confirmed delivery timestamp in the period, excluding cancelled bookings.',
        commonMistakes:
          'Counting a rebooked shipment against its revised promise rather than the original one, which quietly inflates the rate.\nIncluding cancelled bookings in the denominator.\nMixing regional local time with UTC when comparing delivery timestamps across regions.',
        bestPractices:
          'Report the rate alongside the shipment count it is drawn from — a high rate over forty shipments is not comparable to one over four thousand.\nAgree the promised window source system before comparing regions.',
        abbreviations: 'OTD, OTIF (On Time In Full)',
      },
      {
        termName: 'Promised Delivery Window',
        businessDescription:
          'The delivery date range quoted to the customer when a shipment is booked. It is the baseline every on-time measure is judged against.',
        isHeroMetric: false,
      },
      {
        termName: 'Freight Cost per Shipment',
        businessDescription:
          'Total freight spend for a period divided by the number of shipments delivered in it, used to compare lane efficiency across regions.',
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
        termName: 'Shipment Exception',
        businessDescription:
          'Any event that moves a shipment off its planned route or schedule, such as a customs hold, a missed pickup, or a carrier reassignment.',
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
