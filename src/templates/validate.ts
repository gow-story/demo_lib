/**
 * Validates generated HTML against the checklist at the bottom of
 * docs/froala-notes.md. Run this on every HTML string before it reaches the
 * user — the point is that nothing gets pasted into OvalEdge that hasn't been
 * shown to stay inside the vocabulary the working page established.
 *
 * The checks are string/regex based on purpose: the output is a fixed template
 * with all text escaped, so `<` only ever starts a tag and there is no need to
 * pull in a DOM parser.
 */

// Explicit extension: see the note in src/lib/schema.ts.
import { NAV_HREF } from '../lib/nav-href.ts';

/** froala-notes.md, "Allowed tags". */
const ALLOWED_TAGS = new Set([
  'table',
  'tbody',
  'tr',
  'td',
  'div',
  'p',
  'span',
  'strong',
  'br',
  'a',
  'img',
  'hr',
]);

/** froala-notes.md, "Allowed inline CSS properties". */
const ALLOWED_CSS_PROPERTIES = new Set([
  'padding',
  'font-size',
  'color',
  'font-family',
  'border-radius',
  'background-color',
  'width',
  'max-width',
  'text-align',
  'line-height',
  'font-weight',
  'display',
  'margin',
  'margin-bottom',
  'vertical-align',
  'min-height',
  'border',
  'border-top',
  'letter-spacing',
]);

/**
 * `display` is on the allowlist, but "no flexbox, no CSS grid" is a separate
 * rule — so the property check alone would let `display:flex` through.
 */
const ALLOWED_DISPLAY_VALUES = new Set(['block', 'inline', 'inline-block', 'none']);

/** The only class froala-notes.md ever saw, and only on an <img>. */
const FROALA_IMG_CLASS = 'fr-fic fr-dib';

const IMAGE_PATH_PREFIX = 'ovaledgeimages/';
const EDITOR_IMAGE_PREFIX = 'ovaledgeimages/editorimage/';

/** 8-4-4-4-12 or bare 32 hex — i.e. something that looks like a real upload id. */
const UUID_SHAPED =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;

export interface FroalaViolation {
  /** Checklist item this maps to, for grouping output. */
  rule: string;
  message: string;
}

export interface ValidateFroalaHtmlOptions {
  /**
   * Image srcs known to come from a real upload response. A UUID-shaped src
   * that isn't listed here is treated as invented — the validator has no way to
   * tell a fabricated uuid from a real one, and froala-notes.md warns that a
   * fabricated one renders broken with no visible error, so the safe default is
   * to reject any uuid nobody vouched for.
   */
  knownImageSrcs?: readonly string[];
}

export interface FroalaValidationResult {
  ok: boolean;
  violations: FroalaViolation[];
}

function checkNoScriptOrStyle(html: string, out: FroalaViolation[]): void {
  const rule = 'no <script>, no <style> block';
  if (/<script\b/i.test(html)) {
    out.push({ rule, message: 'output contains a <script> tag' });
  }
  if (/<style\b/i.test(html)) {
    out.push({ rule, message: 'output contains a <style> block' });
  }
}

function checkTags(html: string, out: FroalaViolation[]): void {
  const rule = 'no tag outside the allowed list';
  const seen = new Set<string>();
  for (const match of html.matchAll(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g)) {
    const tag = match[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag) && !seen.has(tag)) {
      seen.add(tag);
      const detail = /^h[1-6]$/.test(tag)
        ? ' — headings are <span> with an inline font-size'
        : '';
      out.push({ rule, message: `disallowed tag <${tag}>${detail}` });
    }
  }
}

function checkInlineCss(html: string, out: FroalaViolation[]): void {
  const propertyRule = 'no CSS property outside the allowed list';
  const layoutRule = 'tables only — no flexbox, no CSS grid';
  const seenProperties = new Set<string>();

  for (const styleMatch of html.matchAll(/style="([^"]*)"/g)) {
    for (const declaration of styleMatch[1].split(';')) {
      if (!declaration.trim()) continue;

      const separator = declaration.indexOf(':');
      if (separator === -1) {
        out.push({
          rule: propertyRule,
          message: `malformed style declaration "${declaration.trim()}"`,
        });
        continue;
      }

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim().toLowerCase();

      if (!ALLOWED_CSS_PROPERTIES.has(property) && !seenProperties.has(property)) {
        seenProperties.add(property);
        out.push({ rule: propertyRule, message: `disallowed CSS property "${property}"` });
      }

      if (property === 'display' && !ALLOWED_DISPLAY_VALUES.has(value)) {
        out.push({ rule: layoutRule, message: `disallowed display value "${value}"` });
      }
    }
  }
}

function checkNoOwnClassOrId(html: string, out: FroalaViolation[]): void {
  const rule = 'no class or id attributes of our own';

  for (const match of html.matchAll(/<\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const tag = match[1].toLowerCase();
    const attributes = match[2];

    const classMatch = /\bclass="([^"]*)"/.exec(attributes);
    if (classMatch && !(tag === 'img' && classMatch[1] === FROALA_IMG_CLASS)) {
      out.push({
        rule,
        message: `<${tag}> carries class="${classMatch[1]}" — only <img class="${FROALA_IMG_CLASS}"> is allowed`,
      });
    }

    const idMatch = /\bid="([^"]*)"/.exec(attributes);
    if (idMatch) {
      out.push({ rule, message: `<${tag}> carries id="${idMatch[1]}"` });
    }
  }
}

function checkLinksAndImages(
  html: string,
  knownImageSrcs: readonly string[],
  out: FroalaViolation[],
): void {
  const externalRule = 'no external src/href';
  const uuidRule = 'no invented image UUID';

  for (const match of html.matchAll(/\b(src|href)="([^"]*)"/g)) {
    const attribute = match[1];
    const value = match[2];

    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
      out.push({ rule: externalRule, message: `external ${attribute}="${value}"` });
      continue;
    }

    if (attribute === 'href' && !NAV_HREF.test(value)) {
      out.push({
        rule: externalRule,
        message: `href="${value}" is not an internal #nav/... route`,
      });
      continue;
    }

    if (attribute === 'src') {
      if (!value.startsWith(IMAGE_PATH_PREFIX)) {
        out.push({
          rule: externalRule,
          message: `src="${value}" is not a relative ${IMAGE_PATH_PREFIX}... path`,
        });
        continue;
      }

      const id = value.startsWith(EDITOR_IMAGE_PREFIX)
        ? value.slice(EDITOR_IMAGE_PREFIX.length)
        : '';
      if (UUID_SHAPED.test(id) && !knownImageSrcs.includes(value)) {
        out.push({
          rule: uuidRule,
          message: `src="${value}" looks like a uuid but did not come from a recorded upload`,
        });
      }
    }
  }
}

function checkExplicitTbody(html: string, out: FroalaViolation[]): void {
  const rule = 'every <table> has an explicit <tbody>';
  const tables = html.match(/<table\b[^>]*>/gi)?.length ?? 0;
  const withTbody = html.match(/<table\b[^>]*>\s*<tbody\b/gi)?.length ?? 0;

  if (tables !== withTbody) {
    out.push({
      rule,
      message: `${tables - withTbody} of ${tables} <table> element(s) are not immediately followed by <tbody>`,
    });
  }
}

export function validateFroalaHtml(
  html: string,
  options: ValidateFroalaHtmlOptions = {},
): FroalaValidationResult {
  const knownImageSrcs = options.knownImageSrcs ?? [];
  const violations: FroalaViolation[] = [];

  checkNoScriptOrStyle(html, violations);
  checkTags(html, violations);
  checkInlineCss(html, violations);
  checkNoOwnClassOrId(html, violations);
  checkLinksAndImages(html, knownImageSrcs, violations);
  checkExplicitTbody(html, violations);

  return { ok: violations.length === 0, violations };
}
