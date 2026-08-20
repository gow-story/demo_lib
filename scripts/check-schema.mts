/**
 * Checks the sample DemoPackage against the schema, then confirms a few
 * guideline rules actually reject bad input.
 *
 * Run: npm run check:schema
 */
import {
  DemoPackageSchema,
  PURPOSE_PARAGRAPH_MAX,
  type DemoPackage,
} from '../src/lib/schema.ts';
import { sampleDemoPackage } from '../src/lib/sample.ts';

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

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
