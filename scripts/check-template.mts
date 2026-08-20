/**
 * Renders the sample DemoPackage through the homepage template and runs the
 * froala-notes.md checklist over the result, then confirms the validator
 * actually rejects each thing the checklist forbids.
 *
 * Run: npm run check:template          (add -- --print to dump the HTML)
 */
import { DemoPackageSchema } from '../src/lib/schema.ts';
import { sampleDemoPackage } from '../src/lib/sample.ts';
import { renderHomepage } from '../src/templates/homepage.ts';
import { validateFroalaHtml } from '../src/templates/validate.ts';

let failures = 0;

// The template's contract is a *validated* package, so parse before rendering.
const parsed = DemoPackageSchema.parse(sampleDemoPackage);
const html = renderHomepage(parsed);

const result = validateFroalaHtml(html);
if (result.ok) {
  console.log(`PASS  rendered homepage passes the froala checklist (${html.length} chars)`);
} else {
  failures++;
  console.log('FAIL  rendered homepage violates the froala checklist:');
  for (const violation of result.violations) {
    console.log(`        [${violation.rule}] ${violation.message}`);
  }
}

/** Each snippet must trip the named checklist item. */
const rejectionCases: Array<{ name: string; html: string }> = [
  { name: 'script tag', html: '<div><script>alert(1)</script></div>' },
  { name: 'style block', html: '<style>div{color:red}</style><div>x</div>' },
  { name: 'heading tag', html: '<h1>Data Governance Hub</h1>' },
  {
    name: 'table without explicit tbody',
    html: '<table><tr><td style="width:50%;">x</td></tr></table>',
  },
  { name: 'disallowed css property', html: '<div style="box-shadow:0 0 2px #000;">x</div>' },
  { name: 'flexbox layout', html: '<div style="display:flex;">x</div>' },
  { name: 'our own class', html: '<div class="card">x</div>' },
  { name: 'our own id', html: '<div id="hero">x</div>' },
  { name: 'external image host', html: '<img src="https://example.com/logo.png">' },
  { name: 'external link', html: '<a href="https://ovaledge.com">OvalEdge</a>' },
  { name: 'javascript: link', html: '<a href="javascript:alert(1)">x</a>' },
  { name: 'bare #nav/ with no route', html: '<a href="#nav/">x</a>' },
  {
    name: 'invented image uuid',
    html: '<img class="fr-fic fr-dib" src="ovaledgeimages/editorimage/3f2504e0-4f89-11d3-9a0c-0305e82c3301">',
  },
];

for (const { name, html: badHtml } of rejectionCases) {
  const check = validateFroalaHtml(badHtml);
  if (check.ok) {
    failures++;
    console.log(`FAIL  "${name}" was accepted but should have been rejected`);
  } else {
    console.log(`PASS  "${name}" rejected: ${check.violations[0].message}`);
  }
}

/** Things the loosened link rule and the brand palette must let through. */
const acceptanceCases: Array<{ name: string; ok: boolean; detail: string }> = [];

const tagPageHref =
  '<a href="#nav/tagsview?browse=tiles&amp;id=1143&amp;objectType=oetag&amp;masterTagId=1063">Tags</a>';
acceptanceCases.push({
  name: '#nav route with a query string',
  ok: validateFroalaHtml(tagPageHref).ok,
  detail: 'tag page href rejected by the validator',
});

// Every brand color must actually reach the markup.
const { brand } = parsed.prospect;
for (const [role, hex] of Object.entries(brand)) {
  acceptanceCases.push({
    name: `brand.${role} (${hex}) appears in the output`,
    ok: html.includes(hex),
    detail: `${hex} is not present in the rendered HTML`,
  });
}

// Cards link only where a tagHref exists; the third card must stay plain text.
const cardsWithTag = parsed.homepage.cards.filter((c) => c.tagHref).length;
const tagAnchors = html.match(/<a href="#nav\/tagsview/g)?.length ?? 0;
acceptanceCases.push({
  name: `${cardsWithTag} card tag link(s) rendered, none for the card without a tagHref`,
  ok: tagAnchors === cardsWithTag && html.includes('>AI-Ready Trusted Data</span>'),
  detail: `found ${tagAnchors} tag anchors, expected ${cardsWithTag}`,
});

// Quick Access renders exactly the listed destinations, in the listed order.
const renderedQuickAccess = [...html.matchAll(/<a href="#nav\/([a-z]+)"/g)].map(
  (m) => m[1],
);
acceptanceCases.push({
  name: `quick access renders ${parsed.homepage.quickAccessLinks.join(', ')} in order`,
  ok:
    renderedQuickAccess.join(',') === parsed.homepage.quickAccessLinks.join(','),
  detail: `rendered [${renderedQuickAccess.join(', ')}]`,
});

for (const { name, ok, detail } of acceptanceCases) {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}: ${detail}`);
  }
}

// A uuid the caller vouches for is the one case that must pass.
const vouched =
  '<img class="fr-fic fr-dib" src="ovaledgeimages/editorimage/3f2504e0-4f89-11d3-9a0c-0305e82c3301">';
const vouchedCheck = validateFroalaHtml(vouched, {
  knownImageSrcs: ['ovaledgeimages/editorimage/3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
});
if (vouchedCheck.ok) {
  console.log('PASS  "uuid from a recorded upload" accepted');
} else {
  failures++;
  console.log(`FAIL  recorded upload uuid rejected: ${vouchedCheck.violations[0].message}`);
}

if (process.argv.includes('--print')) {
  console.log(`\n${html}`);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
