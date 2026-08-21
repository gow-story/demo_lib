'use client';

import { useMemo, useState } from 'react';

import {
  extractBrand,
  generateContent,
  publishGlossary,
  type ContentResponse,
  type PublishResponse,
} from '../actions';
import { GenerationProgress, type Stage, type StageState } from './generation-progress';
import { NAV_HREF } from '@/src/lib/nav-href';
import { buildDetailDescription } from '@/src/lib/ovaledge/map-terms';
import type { Brand, DemoPackage, GlossaryTerm } from '@/src/lib/schema';
import { renderHomepage } from '@/src/templates/homepage';
import { validateFroalaHtml } from '@/src/templates/validate';

/**
 * The whole builder UI.
 *
 * Note what is NOT here: any Anthropic import. Generation happens in the server
 * action; everything after it — swatch edits, tag hrefs, re-rendering, copying
 * — is local, because `renderHomepage` is a pure function over the package.
 * Editing a color never costs an API call.
 */

const BRAND_ROLES: Array<{ key: keyof Brand; label: string; hint: string }> = [
  { key: 'primary', label: 'Primary', hint: 'Card titles and links, on white' },
  { key: 'secondary', label: 'Secondary', hint: 'Accent rule above each card' },
  { key: 'dark', label: 'Dark', hint: 'Hero background, white text on top' },
  { key: 'light', label: 'Light', hint: 'Purpose panel tint' },
];

const BRAND_ORIGIN_LABEL: Record<string, string> = {
  'site-extraction': 'Extracted from the company site',
  fallback: 'Neutral palette',
};

const EMPTY_TAG_HREFS = ['', '', ''];

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
  const [companyName, setCompanyName] = useState('');
  const [domain, setDomain] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [result, setResult] = useState<ContentResponse | null>(null);
  const [brandInfo, setBrandInfo] = useState<{
    origin: string;
    note: string;
  } | null>(null);
  const [pkg, setPkg] = useState<DemoPackage | null>(null);
  const [tagHrefs, setTagHrefs] = useState<string[]>(EMPTY_TAG_HREFS);
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

    const withHrefs: DemoPackage = {
      ...pkg,
      homepage: {
        ...pkg.homepage,
        cards: pkg.homepage.cards.map((card, index) => {
          const href = tagHrefs[index]?.trim() ?? '';
          return href && NAV_HREF.test(href)
            ? { ...card, tagHref: href }
            : { ...card, tagHref: undefined };
        }),
      },
    };

    const html = renderHomepage(withHrefs);
    return { html, validation: validateFroalaHtml(html) };
  }, [pkg, tagHrefs]);

  function markStage(id: string, state: StageState, detail?: string) {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, state, detail } : stage,
      ),
    );
  }

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!companyName.trim() || busy) return;

    setBusy(true);
    setResult(null);
    setBrandInfo(null);
    setPkg(null);
    setTagHrefs(EMPTY_TAG_HREFS);
    setPublishResult(null);
    setStages(
      INITIAL_STAGES.map((stage) =>
        stage.id === 'brand' || stage.id === 'content'
          ? { ...stage, state: 'active' }
          : stage,
      ),
    );

    const trimmedDomain = domain.trim() || undefined;

    // Both start now. Brand extraction usually settles within a second or two,
    // and the stage list shows it the moment it does rather than holding the
    // result hostage to the minute-long half.
    const brandPromise = extractBrand(companyName, trimmedDomain).then(
      (brand) => {
        markStage('brand', 'done', brand.note);
        setBrandInfo({ origin: brand.origin, note: brand.note });
        return brand;
      },
    );

    const contentPromise = generateContent({
      companyName,
      domain: trimmedDomain,
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

  function setBrandColor(role: keyof Brand, value: string) {
    setPkg((current) =>
      current
        ? {
            ...current,
            prospect: {
              ...current.prospect,
              brand: { ...current.prospect.brand, [role]: value },
            },
          }
        : current,
    );
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

  /** Exactly one hero metric — selecting one clears the rest. */
  function selectHeroMetric(index: number) {
    setPkg((current) =>
      current
        ? {
            ...current,
            glossary: {
              terms: current.glossary.terms.map((term, i) => ({
                ...term,
                isHeroMetric: i === index,
              })),
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
          Demo Lib
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
                Company name <span className="text-red-600">*</span>
              </span>
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Harborline Logistics"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Website or domain
              </span>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="harborline.com"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <span className="text-xs text-zinc-500">
                Optional. Helps the brand-color and business-context lookup.
              </span>
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
              disabled={busy || !companyName.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? 'Searching and generating…' : 'Generate'}
            </button>
          </form>

          {result && !result.ok && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm font-medium text-red-900 dark:text-red-200">
                {result.message}
              </p>
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
              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Brand colors{' '}
                    <span className="font-normal text-zinc-500">
                      · this generation cost ${result.costUsd.toFixed(3)}
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {brandInfo
                      ? `${BRAND_ORIGIN_LABEL[brandInfo.origin] ?? brandInfo.origin} — ${brandInfo.note}`
                      : 'Palette applied.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {BRAND_ROLES.map(({ key, label, hint }) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800"
                    >
                      <input
                        type="color"
                        value={pkg.prospect.brand[key]}
                        onChange={(e) => setBrandColor(key, e.target.value)}
                        aria-label={`${label} color`}
                        className="h-9 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                          {label}{' '}
                          <span className="font-mono text-zinc-500">
                            {pkg.prospect.brand[key]}
                          </span>
                        </span>
                        <span className="block truncate text-[11px] text-zinc-500">
                          {hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Card tag links
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Optional and manual — paste a real tag page route. Empty
                    means the card renders as plain text.
                  </p>
                </div>
                {pkg.homepage.cards.map((card, index) => {
                  const value = tagHrefs[index] ?? '';
                  const invalid = value.trim() !== '' && !NAV_HREF.test(value.trim());
                  return (
                    <label key={card.title} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {card.title}
                      </span>
                      <input
                        value={value}
                        onChange={(e) =>
                          setTagHrefs((current) =>
                            current.map((href, i) =>
                              i === index ? e.target.value : href,
                            ),
                          )
                        }
                        placeholder="#nav/tagsview?browse=tiles&id=…&objectType=oetag&masterTagId=…"
                        className={`rounded-md border bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100 ${
                          invalid
                            ? 'border-amber-500'
                            : 'border-zinc-300 dark:border-zinc-700'
                        }`}
                      />
                      {invalid && (
                        <span className="text-[11px] text-amber-700 dark:text-amber-500">
                          Not applied — must be an internal #nav/… route.
                        </span>
                      )}
                    </label>
                  );
                })}
              </section>
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
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
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
        onSelectHero={selectHeroMetric}
        onPublish={handlePublish}
      />}
    </div>
  );
}

interface GlossarySectionProps {
  terms: GlossaryTerm[];
  publishing: boolean;
  publishResult: PublishResponse | null;
  onUpdateTerm: (index: number, patch: Partial<GlossaryTerm>) => void;
  onSelectHero: (index: number) => void;
  onPublish: () => void;
}

function GlossarySection({
  terms,
  publishing,
  publishResult,
  onUpdateTerm,
  onSelectHero,
  onPublish,
}: GlossarySectionProps) {
  const hero = terms.find((term) => term.isHeroMetric);
  /**
   * The schema requires the hero metric to carry a formula, so moving the flag
   * to a plain term makes the publish fail server-side. Say so up front rather
   * than letting the user find out by clicking.
   */
  const heroMissingFormula = Boolean(hero && !hero.formula?.trim());
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
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {published
            ? 'Published'
            : publishing
              ? 'Publishing…'
              : 'Publish to OvalEdge'}
        </button>
      </div>

      {heroMissingFormula && (
        <p className="mb-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          The selected hero metric has no formula, so publishing will be
          rejected. Pick the term that was generated as the hero metric, or add
          a formula to this one.
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="w-20 px-2 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Hero
              </th>
              <th className="w-64 px-2 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
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
                    type="radio"
                    name="hero-metric"
                    checked={term.isHeroMetric}
                    onChange={() => onSelectHero(index)}
                    disabled={published}
                    aria-label={`Make ${term.termName} the hero metric`}
                    className="mt-2 h-4 w-4 cursor-pointer"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    value={term.termName}
                    onChange={(e) =>
                      onUpdateTerm(index, { termName: e.target.value })
                    }
                    disabled={published}
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
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
