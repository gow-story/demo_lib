/**
 * Checks the sample DemoPackage against the schema, then confirms a few
 * guideline rules actually reject bad input.
 *
 * Run: npm run check:schema
 */
import {
  DemoPackageSchema,
  GLOSSARY_MAX_TERMS,
  PURPOSE_PARAGRAPH_MAX,
  type DemoPackage,
} from '../src/lib/schema.ts';
import { sampleDemoPackage } from '../src/lib/sample.ts';
import { toOvalEdgeTerms } from '../src/lib/ovaledge/map-terms.ts';

let failures = 0;

const result = DemoPackageSchema.safeParse(sampleDemoPackage);
if (result.success) {
  console.log('PASS  sample DemoPackage validates');
} else {
  failures++;
  console.log('FAIL  sample DemoPackage did not validate:');
  for (const issue of result.error.issues) {
    console.log(`        ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
}

/** Each case mutates a copy of the sample and must be rejected. */
const rejectionCases: Array<{ name: string; mutate: (pkg: DemoPackage) => void }> = [
  {
    name: 'four cards',
    mutate: (pkg) => {
      pkg.homepage.cards.push(pkg.homepage.cards[0]);
    },
  },
  {
    name: 'unknown card pattern',
    mutate: (pkg) => {
      (pkg.homepage as { cardPattern: string }).cardPattern = 'industry-vertical';
    },
  },
  {
    name: 'tagline longer than 5 words',
    mutate: (pkg) => {
      pkg.homepage.hero.tagline = 'Discover and classify and trace and govern everything';
    },
  },
  {
    name: 'HTML in a field',
    mutate: (pkg) => {
      pkg.homepage.hero.title = '<span>Harborline Data Governance Hub</span>';
    },
  },
  {
    name: 'banned buzzword',
    mutate: (pkg) => {
      pkg.homepage.footerStatement = 'A foundation to unlock value across Harborline.';
    },
  },
  {
    name: 'bulleted card description',
    mutate: (pkg) => {
      pkg.homepage.cards[0].description = '- Search across every connected source.';
    },
  },
  {
    name: 'brand color that is not hex',
    mutate: (pkg) => {
      pkg.prospect.brand.primary = 'cornflowerblue';
    },
  },
  {
    name: 'hex brand color missing the hash',
    mutate: (pkg) => {
      pkg.prospect.brand.dark = '0b2b45';
    },
  },
  {
    name: 'purpose paragraph over the character cap',
    mutate: (pkg) => {
      pkg.homepage.purpose.challenge = `${pkg.homepage.purpose.challenge} `.padEnd(
        PURPOSE_PARAGRAPH_MAX + 20,
        'x',
      );
    },
  },
  {
    name: 'external card tagHref',
    mutate: (pkg) => {
      pkg.homepage.cards[0].tagHref = 'https://ovaledge.com/tags/1143';
    },
  },
  {
    name: 'unknown quick access destination',
    mutate: (pkg) => {
      (pkg.homepage.quickAccessLinks as string[]).push('dashboards');
    },
  },
  {
    name: 'repeated quick access destination',
    mutate: (pkg) => {
      pkg.homepage.quickAccessLinks.push('search');
    },
  },
  {
    name: 'no hero metric',
    mutate: (pkg) => {
      for (const term of pkg.glossary.terms) term.isHeroMetric = false;
    },
  },
  {
    name: 'two hero metrics',
    mutate: (pkg) => {
      pkg.glossary.terms[1].isHeroMetric = true;
    },
  },
  {
    name: 'hero metric without a formula',
    mutate: (pkg) => {
      const hero = pkg.glossary.terms.find((t) => t.isHeroMetric)!;
      delete hero.formula;
    },
  },
  {
    name: 'HTML in a glossary field',
    mutate: (pkg) => {
      pkg.glossary.terms[1].businessDescription =
        'The delivery window <strong>promised</strong> at booking.';
    },
  },
  {
    name: 'banned buzzword in a glossary field',
    mutate: (pkg) => {
      pkg.glossary.terms[2].businessDescription =
        'A measure used to democratize data across the freight organization.';
    },
  },
  {
    name: 'invented capability claim about a named system',
    mutate: (pkg) => {
      pkg.glossary.terms[2].businessDescription =
        'Freight spend per shipment, delivered through a unified catalog across Snowflake and SQL Server.';
    },
  },
  {
    name: 'too few glossary terms',
    mutate: (pkg) => {
      pkg.glossary.terms = pkg.glossary.terms.slice(0, 4);
    },
  },
  {
    name: 'too many glossary terms',
    mutate: (pkg) => {
      while (pkg.glossary.terms.length <= GLOSSARY_MAX_TERMS) {
        pkg.glossary.terms.push({
          ...pkg.glossary.terms[1],
          termName: `Filler Term ${pkg.glossary.terms.length}`,
        });
      }
    },
  },
  {
    name: 'duplicate term names',
    mutate: (pkg) => {
      pkg.glossary.terms[2].termName = pkg.glossary.terms[1].termName;
    },
  },
  {
    name: 'capability claim in homepage prose',
    mutate: (pkg) => {
      pkg.homepage.purpose.solution =
        'The platform integrates with Snowflake and Salesforce so every regional team works from one certified source.';
    },
  },
];

for (const { name, mutate } of rejectionCases) {
  const draft: DemoPackage = structuredClone(sampleDemoPackage);
  mutate(draft);
  const parsed = DemoPackageSchema.safeParse(draft);
  if (parsed.success) {
    failures++;
    console.log(`FAIL  "${name}" was accepted but should have been rejected`);
  } else {
    console.log(`PASS  "${name}" rejected: ${parsed.error.issues[0].message}`);
  }
}

// A tag page route carries a query string — it must survive validation intact.
const withTagHref: DemoPackage = structuredClone(sampleDemoPackage);
withTagHref.homepage.cards[2].tagHref =
  '#nav/tagsview?browse=tiles&id=1151&objectType=oetag&masterTagId=1063';
const tagHrefCheck = DemoPackageSchema.safeParse(withTagHref);
if (tagHrefCheck.success) {
  console.log('PASS  "#nav route with a query string" accepted');
} else {
  failures++;
  console.log(`FAIL  tagHref with query string rejected: ${tagHrefCheck.error.issues[0].message}`);
}

// Naming a system is allowed — only claiming a capability about it is not. This
// guards the capability check against being over-eager.
const namesSystem: DemoPackage = structuredClone(sampleDemoPackage);
namesSystem.glossary.terms[1].businessDescription =
  'The delivery date range quoted at booking. Recorded in Snowflake, and re-keyed by hand in two regions.';
const namesSystemCheck = DemoPackageSchema.safeParse(namesSystem);
if (namesSystemCheck.success) {
  console.log('PASS  "names a system without claiming support" accepted');
} else {
  failures++;
  console.log(
    `FAIL  naming a system was rejected: ${namesSystemCheck.error.issues[0].message}`,
  );
}

// The OvalEdge payload constraints, verified without touching the network.
const payload = toOvalEdgeTerms(sampleDemoPackage.glossary, 'Demo');
const heroTerm = sampleDemoPackage.glossary.terms.find((t) => t.isHeroMetric)!;
const heroPayload = payload.find((t) => t.termName === heroTerm.termName)!;

const payloadChecks: Array<{ name: string; ok: boolean }> = [
  {
    name: 'no category key on any term (the API cannot create categories)',
    ok: payload.every((term) => !('category' in term)),
  },
  {
    name: 'no governance roles set (they auto-fill from the token)',
    ok: payload.every(
      (term) =>
        !('steward' in term) && !('owner' in term) && !('custodian' in term),
    ),
  },
  {
    name: 'every term carries action "add" and the one demo domain',
    ok: payload.every(
      (term) => term.action === 'add' && term.domainName === 'Demo',
    ),
  },
  {
    name: "hero metric's formula is folded into detailDescription",
    ok: Boolean(heroPayload.detailDescription?.includes('Formula')),
  },
  {
    name: 'ordinary terms carry no detailDescription',
    ok: payload.filter((term) => term.detailDescription).length === 1,
  },
];

for (const { name, ok } of payloadChecks) {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
