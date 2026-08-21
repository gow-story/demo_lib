'use client';

import { useMemo, useState } from 'react';

import {
  extractBrand,
  generateContent,
  publishGlossary,
  type ContentResponse,
  type PublishResponse,
} from '../actions';
import type { LogoAsset } from '@/src/lib/brand';
import type { CreatedTerm } from '@/src/lib/ovaledge/client';
import { GenerationProgress, type Stage, type StageState } from './generation-progress';
import { companyNameFromDomain, normalizeDomain } from '@/src/lib/domain';
import { buildDetailDescription } from '@/src/lib/ovaledge/map-terms';
import type { DemoPackage, GlossaryTerm } from '@/src/lib/schema';
import { LOGO_PLACEHOLDER_SRC, renderHomepage } from '@/src/templates/homepage';
import { validateFroalaHtml } from '@/src/templates/validate';

/**
 * The whole builder UI.
 *
 * Note what is NOT here: any Anthropic import. Generation happens in the server
 * action; everything after it — swatch edits, tag hrefs, re-rendering, copying
 * — is local, because `renderHomepage` is a pure function over the package.
 * Editing a color never costs an API call.
 */

/** One line per outcome. The palette itself is no longer editable. */
const BRAND_OUTCOME: Record<string, string> = {
  'site-extraction': 'Brand colours found on the site and applied.',
  fallback:
    'No brand colours found on the site — a neutral fallback palette is in use.',
};

/**
 * The three stages the browser can genuinely observe. Brand extraction and
 * content generation each settle when their server action returns; the HTML
 * check runs here, in this component. Nothing is on a timer — if a stage looks
 * stuck, it is stuck.
 */
const INITIAL_STAGES: Stage[] = [
  { id: 'brand', label: 'Extracting brand colours', state: 'pending' },
  { id: 'content', label: 'Writing homepage and glossary', state: 'pending' },
  { id: 'html', label: 'Checking HTML against the Froala rules', state: 'pending' },
];

export function HomepageBuilder() {
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');

  /**
   * What the website field resolves to. Shown under the field so the SE can see
   * the derived name before spending a generation on it — the model may correct
   * it, but a badly wrong derivation is worth catching early.
   */
  const resolvedSite = useMemo(() => {
    const domain = normalizeDomain(website);
    return domain ? { domain, companyName: companyNameFromDomain(domain) } : null;
  }, [website]);

  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [result, setResult] = useState<ContentResponse | null>(null);
  const [brandInfo, setBrandInfo] = useState<{
    origin: string;
    note: string;
    logo?: LogoAsset;
  } | null>(null);
  const [pkg, setPkg] = useState<DemoPackage | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);

  /**
   * The package actually rendered: generated content, plus whatever the user
   * has since edited. Tag hrefs are applied only when they are well-formed, so
   * a half-typed route never reaches the preview.
   */
  const rendered = useMemo(() => {
    if (!pkg) return null;
    const html = renderHomepage(pkg);
    return { html, validation: validateFroalaHtml(html) };
  }, [pkg]);

  function markStage(id: string, state: StageState, detail?: string) {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, state, detail } : stage,
      ),
    );
  }

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!resolvedSite || busy) return;

    setBusy(true);
    setResult(null);
    setBrandInfo(null);
    setPkg(null);
    setPublishResult(null);
    setStages(
      INITIAL_STAGES.map((stage) =>
        stage.id === 'brand' || stage.id === 'content'
          ? { ...stage, state: 'active' }
          : stage,
      ),
    );

    const { domain } = resolvedSite;

    // Both start now. Brand extraction usually settles within a second or two,
    // and the stage list shows it the moment it does rather than holding the
    // result hostage to the minute-long half.
    const brandPromise = extractBrand(domain).then((brand) => {
      markStage('brand', 'done', brand.note);
      setBrandInfo({ origin: brand.origin, note: brand.note, logo: brand.logo });
      return brand;
    });

    const contentPromise = generateContent({
      domain,
      discovery: notes.trim() ? { kind: 'notes', text: notes } : { kind: 'none' },
    }).then((response) => {
      markStage(
        'content',
        response.ok ? 'done' : 'failed',
        response.ok
          ? `accepted on attempt ${response.attempts} · $${response.costUsd.toFixed(3)}`
          : 'rejected by the validator twice',
      );
      return response;
    });

    const [brand, response] = await Promise.all([brandPromise, contentPromise]);

    setResult(response);
    if (response.ok) {
      const merged: DemoPackage = {
        ...response.pkg,
        prospect: { ...response.pkg.prospect, brand: brand.brand },
      };

      // Real work, done here rather than inferred: render the template and run
      // the Froala checklist over the result. It is fast, so this stage reports
      // an outcome rather than lingering — but the outcome is a genuine one.
      markStage('html', 'active');
      const validation = validateFroalaHtml(renderHomepage(merged));
      markStage(
        'html',
        validation.ok ? 'done' : 'failed',
        validation.ok
          ? 'passes — safe to paste'
          : `${validation.violations.length} violation(s)`,
      );

      setPkg(merged);
    }
    setBusy(false);
  }

  function updateTerm(index: number, patch: Partial<GlossaryTerm>) {
    setPkg((current) =>
      current
        ? {
            ...current,
            glossary: {
              terms: current.glossary.terms.map((term, i) =>
                i === index ? { ...term, ...patch } : term,
              ),
            },
          }
        : current,
    );
  }

  async function handlePublish() {
    if (!pkg || publishing) return;
    setPublishing(true);
    setPublishResult(await publishGlossary(pkg.glossary));
    setPublishing(false);
  }

  async function handleCopy() {
    if (!rendered) return;
    try {
      await navigator.clipboard.writeText(rendered.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Demo Kit
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Discovery notes in, OvalEdge-ready homepage HTML out.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Website <span className="text-red-600">*</span>
              </span>
              <input
                required
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="farmers.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                  website.trim() && !resolvedSite
                    ? 'border-amber-500'
                    : 'border-zinc-300 focus:border-zinc-500 dark:border-zinc-700'
                }`}
              />
              {website.trim() && !resolvedSite ? (
                <span className="text-xs text-amber-700 dark:text-amber-500">
                  Not a usable domain. Enter something like farmers.com.
                </span>
              ) : resolvedSite ? (
                <span className="text-xs text-zinc-500">
                  <span className="font-mono">{resolvedSite.domain}</span> · company
                  name read as &ldquo;{resolvedSite.companyName}&rdquo;, refined during
                  generation
                </span>
              ) : (
                <span className="text-xs text-zinc-500">
                  The site grounds the brand colours, the logo, and the business
                  context.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Discovery notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                placeholder="What did they say on the call? Which problems came up, in their words?"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <span className="text-xs text-zinc-500">
                Optional, but these outweigh the website — they decide what the
                page emphasizes.
              </span>
            </label>

            <button
              type="submit"
              disabled={busy || !resolvedSite}
              className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? 'Searching and generating…' : 'Generate'}
            </button>
            <p className="text-center text-xs text-zinc-500">
              Generation takes about 60 seconds.
            </p>
          </form>

          {result && !result.ok && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm font-medium text-red-900 dark:text-red-200">
                {result.message}
              </p>
              {result.costUsd !== undefined && (
                <p className="mt-1 text-sm font-semibold tabular-nums text-red-900 dark:text-red-200">
                  ${result.costUsd.toFixed(2)} spent
                </p>
              )}
              {result.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-800 dark:text-red-300">
                  {result.issues.map((issue, i) => (
                    <li key={i} className="font-mono">
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
              {result.rawOutput && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-red-800 dark:text-red-300">
                    Last model output
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-red-100 p-2 text-[11px] leading-relaxed text-red-900 dark:bg-red-950 dark:text-red-200">
                    {result.rawOutput}
                  </pre>
                </details>
              )}
            </div>
          )}

          {pkg && result?.ok && (
            <>
              {/* One line, no swatches. The palette is good enough that the
                  editing controls were only noise. */}
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {brandInfo
                  ? (BRAND_OUTCOME[brandInfo.origin] ?? brandInfo.note)
                  : 'Palette applied.'}
              </p>

              <LogoSection logo={brandInfo?.logo} />
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {rendered ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Preview
                  </h2>
                  {rendered.validation.ok ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-500">
                      Passes the Froala checklist — safe to paste.
                    </p>
                  ) : (
                    <p className="text-xs text-red-700 dark:text-red-400">
                      {rendered.validation.violations.length} Froala violation(s)
                      — do not paste this.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  {copied ? 'Copied' : 'Copy HTML'}
                </button>
              </div>

              {!rendered.validation.ok && (
                <ul className="list-disc space-y-1 rounded-md border border-red-300 bg-red-50 p-3 pl-7 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {rendered.validation.violations.map((violation, i) => (
                    <li key={i} className="font-mono">
                      [{violation.rule}] {violation.message}
                    </li>
                  ))}
                </ul>
              )}

              <iframe
                title="Homepage preview"
                srcDoc={rendered.html}
                sandbox=""
                className="h-[70vh] w-full rounded-md border border-zinc-300 bg-white dark:border-zinc-700"
              />

              {/*
                Deliberately prominent. This is the number that decides whether
                the tool is viable across a team, so it is not a footnote.
              */}
              {result?.ok && (
                <div className="flex flex-wrap items-baseline gap-2 rounded-md border border-zinc-300 px-4 py-3 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    This generation cost
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    ${result.costUsd.toFixed(2)}
                  </span>
                  {result.attempts > 1 && (
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      · {result.attempts} attempts, the first was rejected
                    </span>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Next steps
                </p>
                {/* The only place the hand-off is described. The logo section
                    deliberately does not repeat it. */}
                <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  <li>
                    Copy the HTML and paste it into a new OvalEdge Data Story.
                  </li>
                  <li>
                    {brandInfo?.logo
                      ? 'Download the logo above and upload it in the OvalEdge editor.'
                      : 'Source the company logo yourself — none was found on the site — and upload it in the OvalEdge editor.'}
                  </li>
                  <li>
                    In the pasted HTML, find{' '}
                    {/* Imported from the template, never retyped, so the string
                        shown here cannot drift from the one in the HTML. */}
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] break-all text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      {LOGO_PLACEHOLDER_SRC}
                    </code>{' '}
                    and replace it with the{' '}
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      ovaledgeimages/editorimage/&lt;uuid&gt;
                    </code>{' '}
                    path the upload returns.
                  </li>
                  <li>Publish the Data Story as a homepage widget.</li>
                </ol>
              </div>
            </>
          ) : busy ? (
            <GenerationProgress stages={stages} />
          ) : (
            <div className="flex h-[70vh] items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
              The preview appears here once you generate.
            </div>
          )}
        </div>
      </div>

      {pkg && <GlossarySection
        terms={pkg.glossary.terms}
        publishing={publishing}
        publishResult={publishResult}
        onUpdateTerm={updateTerm}
        onPublish={handlePublish}
      />}
    </div>
  );
}

const LOGO_SOURCE_LABEL: Record<string, string> = {
  'og:image': 'og:image meta tag',
  'apple-touch-icon': 'apple-touch-icon',
  favicon: 'favicon',
};

/** A file extension for the download, derived from what the server actually got. */
function logoFilename(contentType: string): string {
  const extension =
    { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp',
      'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico' }[contentType] ?? 'img';
  return `logo.${extension}`;
}

/**
 * The logo, when the site had one.
 *
 * Always rendered, including the empty case — a section that vanishes when
 * nothing was found leaves the SE wondering whether it was tried. What to *do*
 * with it lives in the Next steps block under the preview, so it is stated once.
 */
function LogoSection({ logo }: { logo?: LogoAsset }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Logo
        </h2>
        <p className="text-xs text-zinc-500">
          {logo
            ? `Found via ${LOGO_SOURCE_LABEL[logo.from] ?? logo.from} · ${logo.contentType} · ${Math.max(1, Math.round(logo.bytes / 1024))} KB`
            : 'No logo found on the site. Add one by hand.'}
        </p>
      </div>

      {logo && (
        <div className="flex items-center gap-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          {/*
            A data: URI from the server, not a remote URL — so it renders with
            no cross-origin request and `download` actually downloads.
            eslint-disable-next-line @next/next/no-img-element: next/image
            cannot optimise a data URI, and this is a preview of bytes we
            already hold.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.dataUri}
            alt="Logo found on the company site"
            className="h-14 w-14 shrink-0 object-contain"
          />
          <a
            href={logo.dataUri}
            download={logoFilename(logo.contentType)}
            className="cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Download
          </a>
        </div>
      )}

    </section>
  );
}

/**
 * What to do after publishing: link the hero metric to its components by hand.
 *
 * `/businessglossary/term/related/add` is authenticated by browser session, not
 * by our JWT — it answers a token with an HTML login page — so this cannot be
 * automated from here. See docs/KNOWN-ISSUES.md. The termIds are listed beside
 * every name because finding a term by name in the OvalEdge UI is the slow part.
 */
function TermLinkInstructions({
  hero,
  created,
}: {
  hero: GlossaryTerm;
  created: CreatedTerm[];
}) {
  const idByName = new Map(
    created.map((term) => [term.termName.trim().toLowerCase(), term.termId]),
  );
  const idOf = (name: string) => idByName.get(name.trim().toLowerCase());

  const heroId = idOf(hero.termName);
  const links = (hero.componentTerms ?? []).map((name) => ({
    name,
    id: idOf(name),
  }));

  const label = (name: string, id?: number) =>
    id === undefined ? `${name} (id not returned)` : `${name} (${id})`;

  return (
    <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        One manual step: link the hero metric to its components
      </p>
      <p className="mt-1 text-xs text-amber-900 dark:text-amber-300">
        OvalEdge&rsquo;s term-relationship endpoint is authenticated by browser
        session rather than by an API token, so this app cannot create these
        links. Add them by hand in the OvalEdge UI — the ids are listed so the
        terms are quick to find.
      </p>
      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li
            key={link.name}
            className="font-mono text-xs text-amber-900 dark:text-amber-200"
          >
            {label(hero.termName, heroId)} &rarr; {label(link.name, link.id)}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface GlossarySectionProps {
  terms: GlossaryTerm[];
  publishing: boolean;
  publishResult: PublishResponse | null;
  onUpdateTerm: (index: number, patch: Partial<GlossaryTerm>) => void;
  onPublish: () => void;
}

function GlossarySection({
  terms,
  publishing,
  publishResult,
  onUpdateTerm,
  onPublish,
}: GlossarySectionProps) {
  const hero = terms.find((term) => term.isHeroMetric);
  const componentNames = new Set(
    (hero?.componentTerms ?? []).map((name) => name.trim().toLowerCase()),
  );
  const isComponent = (term: GlossaryTerm) =>
    !term.isHeroMetric && componentNames.has(term.termName.trim().toLowerCase());

  /**
   * The cross-reference the schema enforces, checked here too. Renaming a term
   * the hero metric depends on is an easy edit to make and breaks the publish
   * server-side, so say so before the click rather than after it.
   */
  const definedNames = new Set(
    terms.filter((t) => !t.isHeroMetric).map((t) => t.termName.trim().toLowerCase()),
  );
  const brokenComponents = (hero?.componentTerms ?? []).filter(
    (name) => !definedNames.has(name.trim().toLowerCase()),
  );

  const published = publishResult?.ok === true;

  return (
    <section className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Business glossary
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {terms.length} terms. Edit before publishing — nothing reaches
            OvalEdge until you click publish.
          </p>
        </div>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing || published}
          className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {published
            ? 'Published'
            : publishing
              ? 'Publishing…'
              : 'Publish to OvalEdge'}
        </button>
      </div>

      {brokenComponents.length > 0 && (
        <p className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          The hero metric is derived from{' '}
          {brokenComponents.map((n) => `"${n}"`).join(' and ')}, which no longer
          match a term in this glossary. Publishing will be rejected until the
          names line up again.
        </p>
      )}

      {publishResult && !publishResult.ok && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-900 dark:text-red-200">
            {publishResult.message}
          </p>
          {publishResult.issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-800 dark:text-red-300">
              {publishResult.issues.map((issue, i) => (
                <li key={i} className="font-mono">
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {publishResult?.ok && (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            {publishResult.created.length} term(s) created in domain &ldquo;
            {publishResult.domain}&rdquo; as DRAFT.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-emerald-900 dark:text-emerald-300">
            {publishResult.created.map((term) => (
              <li key={term.termId} className="font-mono">
                {term.termId} · {term.termName}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-400">
            Reorganize into the real domains and categories in the OvalEdge UI —
            the API cannot create either.
          </p>
        </div>
      )}

      {publishResult?.ok && hero && (hero.componentTerms?.length ?? 0) > 0 && (
        <TermLinkInstructions
          hero={hero}
          created={publishResult.created}
        />
      )}

      {hero && (
        <div className="mb-5 rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
          <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
            Hero metric
          </p>
          <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {hero.termName}
          </p>
          {hero.formula && (
            <p className="mt-2 rounded bg-zinc-100 px-2 py-1.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {hero.formula}
            </p>
          )}
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            Derived from{' '}
            {(hero.componentTerms ?? []).map((name, i, all) => (
              <span key={name}>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {name}
                </span>
                {i < all.length - 2 ? ', ' : i === all.length - 2 ? ' and ' : ''}
              </span>
            ))}
            , each defined as its own term below.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="w-72 px-2 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Term
              </th>
              <th className="px-2 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Business description
              </th>
            </tr>
          </thead>
          <tbody>
            {terms.map((term, index) => (
              <tr
                key={index}
                className="border-b border-zinc-200 align-top dark:border-zinc-800"
              >
                <td className="px-2 py-2">
                  <input
                    value={term.termName}
                    onChange={(e) =>
                      onUpdateTerm(index, { termName: e.target.value })
                    }
                    disabled={published}
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  {(term.isHeroMetric || isComponent(term)) && (
                    <span
                      className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        term.isHeroMetric
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {term.isHeroMetric
                        ? 'Hero metric'
                        : `Component of ${hero?.termName ?? 'the hero metric'}`}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <textarea
                    value={term.businessDescription}
                    onChange={(e) =>
                      onUpdateTerm(index, { businessDescription: e.target.value })
                    }
                    disabled={published}
                    rows={3}
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  {term.isHeroMetric && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-zinc-500">
                        Detail sent to OvalEdge for this term
                      </summary>
                      <pre className="mt-1 max-h-56 overflow-auto rounded bg-zinc-100 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                        {buildDetailDescription(term) ?? '(none)'}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
