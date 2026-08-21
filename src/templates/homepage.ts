import type { Brand, DemoPackage, QuickAccessLink } from '../lib/schema';

/**
 * Renders a validated DemoPackage as OvalEdge-ready HTML.
 *
 * Every tag, CSS property, font stack, link target and image path in here is
 * drawn from docs/froala-notes.md, which is derived from a hand-built page that
 * pastes cleanly into the Froala editor. Do not add a tag or property that
 * isn't on those lists without testing a save/reload round trip first — and
 * when you do, add it to the allowlists in ./validate.ts at the same time.
 */

/**
 * Shipped in place of a real image src. froala-notes.md is explicit that a
 * fabricated UUID renders as a broken image with no visible error, so this is
 * deliberately not UUID-shaped: it is meant to be obvious in the editor and to
 * fail the validator's invented-UUID check if anyone swaps in a made-up id.
 * v1 workflow: upload the logo by hand, paste the returned uuid over this.
 */
export const LOGO_PLACEHOLDER_SRC =
  'ovaledgeimages/editorimage/UPLOAD-LOGO-THEN-PASTE-REAL-UUID-HERE';

/**
 * Web-safe stacks, declared inline every time (froala-notes.md, "Fonts").
 * These are complete style fragments — they carry their own trailing `;` so
 * they can be dropped straight into a style attribute.
 */
const SANS = 'Arial, Helvetica, sans-serif;';
const HEAVY = 'Arial Black, Arial, Helvetica, sans-serif;';

/**
 * Fixed neutrals. Everything else comes from the prospect's palette — body copy
 * and hairlines stay neutral so they remain readable against any brand color.
 */
const BODY = '#3d4b5c';
const HAIRLINE = '#d9dee5';
const ON_DARK = '#ffffff';

const CONTENT_WIDTH = 'width:100%; max-width:900px; margin:0 auto;';

/** The fixed OvalEdge destinations, keyed by the schema's enum. */
const QUICK_ACCESS: Record<QuickAccessLink, { href: string; label: string }> = {
  search: { href: '#nav/search', label: 'Search' },
  glossary: { href: '#nav/glossary', label: 'Glossary' },
  marketplace: { href: '#nav/marketplace', label: 'Marketplace' },
  lineage: { href: '#nav/lineage', label: 'Lineage' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RenderHomepageOptions {
  /**
   * A real `ovaledgeimages/editorimage/<uuid>` path from an actual upload
   * response. Omit it and the marked placeholder ships instead.
   */
  logoSrc?: string;
}

function renderHero(
  hero: DemoPackage['homepage']['hero'],
  brand: Brand,
  logoSrc: string,
): string {
  return [
    `<table style="${CONTENT_WIDTH} background-color:${brand.dark}; border-radius:8px;">`,
    '  <tbody>',
    '    <tr>',
    '      <td style="padding:40px 32px; text-align:center;">',
    `        <img class="fr-fic fr-dib" style="width:190px; max-width:100%; margin-bottom:22px;" src="${escapeHtml(logoSrc)}">`,
    '        <div style="margin-bottom:12px;">',
    `          <span style="font-family:${HEAVY} font-size:32px; color:${ON_DARK}; line-height:1.25;">${escapeHtml(hero.title)}</span>`,
    '        </div>',
    '        <div style="margin-bottom:20px;">',
    `          <span style="font-family:${SANS} font-size:16px; color:${brand.light}; letter-spacing:2px;">${escapeHtml(hero.tagline)}</span>`,
    '        </div>',
    '        <div>',
    `          <span style="display:inline-block; padding:9px 18px; background-color:${brand.primary}; border-radius:20px; font-family:${SANS} font-size:13px; color:${ON_DARK}; letter-spacing:1px;">${escapeHtml(hero.badge)}</span>`,
    '        </div>',
    '      </td>',
    '    </tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
}

/** Three <td> in one <tr>, each with an inline width percentage. */
function renderCards(
  cards: DemoPackage['homepage']['cards'],
  brand: Brand,
): string {
  const cells = cards.map((card) => {
    // Card titles are plain text. Tag page links are added by hand in the
    // OvalEdge editor, so the template never emits an anchor here.
    const titleStyle = `font-family:${HEAVY} font-size:17px; color:${brand.primary}; line-height:1.3;`;
    const title = `<span style="${titleStyle}">${escapeHtml(card.title)}</span>`;

    return [
      '      <td style="width:33.33%; vertical-align:top; padding:0 8px;">',
      `        <div style="padding:24px; background-color:#ffffff; border:1px solid ${HAIRLINE}; border-top:3px solid ${brand.secondary}; border-radius:8px; min-height:180px;">`,
      `          <div style="margin-bottom:10px;">${title}</div>`,
      `          <p style="margin:0; font-family:${SANS} font-size:14px; color:${BODY}; line-height:1.6;">${escapeHtml(card.description)}</p>`,
      '        </div>',
      '      </td>',
    ].join('\n');
  });

  return [
    `<table style="${CONTENT_WIDTH}">`,
    '  <tbody>',
    '    <tr>',
    ...cells,
    '    </tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
}

function renderPurpose(
  purpose: DemoPackage['homepage']['purpose'],
  brand: Brand,
): string {
  const paragraph = (text: string, last: boolean) =>
    `        <p style="margin:0${last ? '' : ' 0 14px 0'}; font-family:${SANS} font-size:15px; color:${BODY}; line-height:1.7;">${escapeHtml(text)}</p>`;

  return [
    `<table style="${CONTENT_WIDTH}">`,
    '  <tbody>',
    '    <tr>',
    `      <td style="padding:28px 32px; background-color:${brand.light}; border-radius:8px;">`,
    paragraph(purpose.challenge, false),
    paragraph(purpose.solution, true),
    '      </td>',
    '    </tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
}

/** Renders only the listed destinations, in the order given. */
function renderQuickAccess(
  links: readonly QuickAccessLink[],
  brand: Brand,
): string | null {
  if (links.length === 0) return null;

  const width = (100 / links.length).toFixed(2);
  const cells = links.map((key) => {
    const { href, label } = QUICK_ACCESS[key];
    return [
      `      <td style="width:${width}%; text-align:center; padding:14px 8px;">`,
      `        <a href="${href}" style="font-family:${SANS} font-size:14px; font-weight:bold; color:${brand.primary}; letter-spacing:1px;">${label}</a>`,
      '      </td>',
    ].join('\n');
  });

  return [
    `<table style="${CONTENT_WIDTH}">`,
    '  <tbody>',
    '    <tr>',
    ...cells,
    '    </tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
}

function renderFooter(footerStatement: string): string {
  return [
    `<table style="${CONTENT_WIDTH}">`,
    '  <tbody>',
    '    <tr>',
    `      <td style="padding:20px 32px; text-align:center; border-top:1px solid ${HAIRLINE};">`,
    `        <span style="font-family:${SANS} font-size:14px; color:${BODY}; line-height:1.6;">${escapeHtml(footerStatement)}</span>`,
    '      </td>',
    '    </tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
}

export function renderHomepage(
  pkg: DemoPackage,
  options: RenderHomepageOptions = {},
): string {
  const { brand } = pkg.prospect;
  const { hero, cards, purpose, quickAccessLinks, footerStatement } = pkg.homepage;
  const logoSrc = options.logoSrc ?? LOGO_PLACEHOLDER_SRC;

  // Sections are separated by a bare <br> between tables, never by margin or
  // padding on the table itself (froala-notes.md, "Spacing conventions").
  return [
    renderHero(hero, brand, logoSrc),
    renderCards(cards, brand),
    renderPurpose(purpose, brand),
    renderQuickAccess(quickAccessLinks, brand),
    renderFooter(footerStatement),
  ]
    .filter((section): section is string => section !== null)
    .join('\n<br>\n');
}
