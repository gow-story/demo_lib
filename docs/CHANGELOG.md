# Changelog

What has been built, newest first. Each entry records what it does and any decision
that isn't obvious from reading the code. This is where the reasoning that would
otherwise go in a long commit message lives — commit messages stay to one line.

---

## Website as the single required input

The two fields — company name (required) and website (optional) — collapse into one
required Website field. `src/lib/domain.ts`.

- **The website is what actually grounds everything**: brand colours, the logo, and the
  business-context lookup all key off the site. A free-text company name could not — "Acme"
  is forty companies, acme.com is one — so requiring the domain removes a whole class of
  wrong-company generation and narrows what the model has to search for.
- **The company name is derived from the domain, then refined by the model.** The
  derivation is deliberately a guess: `farmers.com` gives "Farmers" when the company is
  Farmers Insurance, `johndeere.com` gives "Johndeere". The generation prompt is given the
  derived name and told to correct it from the discovery notes or the site, and to leave it
  alone otherwise. `prospect.name` stays in the schema — the hero title uses it.
- **The model's name is sanitized, not trusted.** `pickCompanyName` falls back to the
  derived name for anything empty, over 80 characters, multi-line, or containing markup, so
  a bad correction cannot reach the hero title or cost a retry.
- **Normalization and validation live in one dependency-free module** so the browser can
  validate the field before submit and the server can re-validate on arrival without either
  pulling in zod. Accepts what people paste — `https://farmers.com/`,
  `www.farmers.com/about?utm=x` — and rejects bare words, IPs, and `localhost`.
- The field shows what it resolved to (`farmers.com · company name read as "Farmers"`)
  before a generation is spent, so a badly wrong derivation is visible early.
- `GenerateRequest` is now `{ domain, discovery }`. The name is derived server-side in both
  actions from the same pure function, so a client cannot send a name and domain that
  disagree.

## Cost shown prominently, and next steps under the preview

The per-generation cost is its own bordered element reading "This generation cost $0.10",
with the figure at 2xl. It is the number that decides whether this is viable across a
team, so it is not a footnote. A run that needed two attempts says so.

It sits **below** the preview rather than above it: the preview is what the SE came for,
and the cost and the hand-off instructions both belong after it, in the order the work
actually happens.

Under the cost, three numbered steps for what to do with the HTML — paste into a new
OvalEdge Data Story, replace the logo placeholder, publish as a homepage widget. The
placeholder string is `LOGO_PLACEHOLDER_SRC` imported from the template rather than
retyped, so what the instruction says to search for cannot drift from what the HTML
contains. The logo section on the left names the same constant for the same reason; the
two overlap on that one step by design, since the SE may arrive at it from either side.

Failed runs report their cost too — `ContentResponse` carries `costUsd` on the failure
branch. A generation rejected twice still spent tokens, and those are the ones most worth
noticing.

## Logo fetching

`resolveBrand` now finds the company's logo alongside the palette, and the UI shows it
with a download button and the instructions for getting it into OvalEdge.

- **It rides on a fetch that already happened.** The site HTML was already being read for
  colours; finding the logo costs one extra image request, not another page load.
- **Search order is apple-touch-icon, favicon, og:image**, with SVG/PNG preferred over ICO
  and larger preferred over smaller within a source. A conventional `/favicon.ico` is
  always appended as a last resort, whether or not the page declares it.
- **Fetched server-side and returned as a data URI**, not as a URL. Two reasons: the
  preview renders with no cross-origin request, and `<a download>` actually downloads —
  the `download` attribute is ignored on cross-origin hrefs. Capped at 512 KB.
- **Never blocks anything.** Logo fetching has its own catch inside `resolveBrand`, so a
  slow CDN or a 404 favicon cannot cost the palette that was already extracted, and
  generation runs in parallel regardless.
- **The empty case is shown, not hidden.** A section that disappears when nothing was
  found leaves the SE wondering whether it was even tried.
- The instruction names `LOGO_PLACEHOLDER_SRC` verbatim, imported from the template rather
  than retyped, so the string in the UI cannot drift from the string in the HTML.
- **`og:image` is last on purpose.** The first cut tried it first and stripe.com returned a
  305 KB JPEG social share card — a banner, not a mark, and wrong for the template's 190px
  slot. The touch icon and favicon are almost always the real logo, so they take priority
  despite being smaller; with the order reversed Stripe resolves to a ~400 byte
  `favicon.svg`. The UI still reports the matched source, type and size, so a bad match
  stays visible. See [KNOWN-ISSUES.md](KNOWN-ISSUES.md).
- Also moved the per-generation cost out of the "Brand colors" heading onto its own quiet
  line under the preview. It describes the whole run, not the brand step, and that heading
  now has a logo section under it.

## Generation progress UI

Replaced the static loading text with a live stage list, rotating status lines, and a
rotating joke. `app/_components/generation-progress.tsx`.

- **The stage list reflects real work, not a timer.** The single generate action was
  split into `extractBrand` and `generateContent`, fired in parallel from the client, so
  the browser can show brand extraction finishing at ~1s instead of hiding it behind the
  minute-long half. Each stage flips when its promise settles and carries the real
  outcome — the palette note, the attempt count and cost, the Froala result.
- **No percentage**, because there is no honest number to put in one. Nothing is on a
  timer: if a stage looks stuck, it is stuck.
- **The HTML check runs in the handler**, not inferred from a `useMemo`. It genuinely
  renders the template and runs the validator at that point. It is fast, so it reports an
  outcome rather than lingering — but the outcome is real.
- **Streaming was considered and rejected.** True mid-flight phases (including the
  schema-validation retry) would need a streamed server action; Next 16's bundled docs
  don't document returning a stream or async iterable from one, and it could not be
  verified in a browser here. Two parallel actions give genuinely live stages with no
  framework uncertainty. If streaming is confirmed later, the retry becomes observable —
  worth revisiting, since `attempts: 2` means the user waited through a second model call
  with no sign of it.
- **Below the stages: a static "Meanwhile, in data governance…" header over a rotating
  observation**, every 10s. The header's trailing dots carry the sense of something still
  running.
- **Observations, not jokes.** The first pass wrote them as jokes and they read as failed
  ones: the content was true and recognizable, but the punchline framing set up an
  expectation the lines could not meet. Reframing them as dispatches from the job made
  the specificity the payoff instead of a setup. Anything reaching for a joke structure —
  borrowed formats, contradiction punchlines, repetition-for-effect — was dropped or
  flattened. Adding one: make it specific and true rather than clever.
- Observations rotate via a shuffled queue that never repeats until the pool is
  exhausted. Selection happens in an effect, not during render — `Math.random()` in a
  render body would be a hydration mismatch.
- An earlier pass also rotated invented status gerunds ("Asking the warehouse nicely")
  above the observation. Removed — two rotating elements competed, and the honest
  progress was already in the stage list. The live region moved onto the stage list,
  which is the part carrying real information and changes about three times per run.
- No extra Anthropic calls: `extractBrand` scrapes the site, and generation is still one
  model call producing both sections.

## JWT minting

Replaced the pasted `OVALEDGE_JWT` with `OVALEDGE_USER_TOKEN` + `OVALEDGE_USER_SECRET`.
`src/lib/ovaledge/client.ts` exchanges those for a JWT at
`POST /api/user/token/generate`, caches it in module memory with its expiry, and reuses
it until shortly before it lapses.

- **Why it had to change:** the JWT's `exp` claim lands the same day it is issued. A
  pasted token works one afternoon and is dead the next morning, so every SE would open
  a broken app.
- **Expiry comes from the token, not a guess** — the `exp` claim is read by
  base64-decoding the JWT's middle segment. Re-mint happens 60s before expiry rather
  than waiting for a failure.
- **Concurrent mints are shared.** Two requests arriving with a cold cache join one
  in-flight exchange. `refreshRejectedToken` takes the token that was rejected and only
  clears the cache if it is still the cached one — otherwise a burst of concurrent 401s
  would each mint and discard each other's fresh tokens.
- **The 401 retry does not contradict the no-retry-on-writes rule.** A 401 is rejected
  at the door, so the write never happened and re-issuing it cannot duplicate anything.
  Ambiguous failures — timeouts, 5xx — are still never retried. A second 401 surfaces.
- **The mint response is plain text, not JSON.** `.json()` on it fails. See
  [ovaledge-api-notes.md](ovaledge-api-notes.md).
- **Nothing logs the token or the credentials.** When a mint returns something that
  isn't a JWT, the error reports the length and expected shape but withholds the body —
  if the shape check is what's wrong, echoing it would leak the credential.
- Added `"erasableSyntaxOnly": true` to `tsconfig.json` after a constructor parameter
  property in `OvalEdgeError` crashed Node's type stripping, which the check scripts run
  on. The flag catches that class of problem at typecheck time.

## Business glossary generation and publishing

`glossary` section on `DemoPackage`: 6–8 terms, each with a name and business
description, exactly one flagged `isHeroMetric`. The hero metric carries formula,
components, common mistakes, best practices, and abbreviations. Published to OvalEdge via
`POST /api/term/addTerm/v2` behind an explicit click.

- **One Anthropic call produces both sections.** A second call would double the
  cached-prefix cost and let the homepage and glossary drift away from the same
  discovery context.
- **`formula` is a hard requirement on the hero metric**, not a suggestion. A soft rule
  the model can skip produces a glossary where the hero term isn't actually the detailed
  one. The other four detail fields are strongly prompted but optional. Consequence: the
  UI warns when the hero radio moves to a term without a formula, because the publish
  would be rejected server-side.
- **Ordinary terms deliberately carry no detail fields.** A glossary where every term is
  exhaustively documented reads as generated.
- **The five detail fields merge into `detailDescription` at the API boundary only.**
  OvalEdge has no field for a formula or its components, but keeping them separate in
  the schema means the model writes them separately and the SE edits them separately.
- **The publish button disables after success.** The API has no upsert and no
  idempotency key, so a second click means a duplicate set of terms to clean up by hand.
- The edited glossary is re-validated server-side before publishing — it arrives from
  the browser after the user has changed it, so it is not trusted.

## Capability-claim guardrail

A generated line read "delivers a unified catalog across Snowflake, SQL Server, and
Salesforce" — a connector claim nobody made, and exactly what content guideline 8
forbids. Now rejected by the schema, across both homepage prose and glossary copy.

- **Naming a system is allowed; claiming a capability about it is not.** "Revenue is
  recorded in Snowflake" passes; "integrates with Snowflake" does not. The check fires
  only when a claim marker sits within 50 characters of a named system.
- It is a heuristic, so the risk is false positives rather than misses. `check:schema`
  asserts both directions — that a claim is rejected *and* that naming a system without
  a claim is accepted. The marker and vendor lists at the top of `src/lib/schema.ts` are
  the tuning point.

## WCAG AA contrast floor on brand roles

Brand colors are ranked by frequency, but each of the four template roles only considers
colors that can actually do its job.

- **Straight top-four-by-frequency does not work.** It put Patagonia's pale periwinkle
  `#91abe9` into `primary`, which the template renders as 14px text on white — a 2.3:1
  contrast ratio. `primary` now requires 4.5:1 against white and resolves to their
  actual red.
- `dark` must be dark enough for white text; `light` avoids pure white, which would make
  the purpose panel disappear. Any role with no qualifying candidate keeps its neutral
  default, and the UI reports how many of the four were filled.

## Cost reduction: $0.86 → $0.05 per generation

The first working generation cost $0.86 (71c tokens, 15c web search). Root cause was web
search context accumulation — results are injected into context and re-sent every turn.

- **Deterministic brand extraction replaced an LLM call.** `resolveBrand` now fetches
  the site, scrapes hex colors from the markup and up to three same-origin stylesheets,
  and ranks by frequency. A page's palette does not need a language model, and this was
  the single most expensive part of a generation. Runs in 0.2–1.2s.
- **Web search capped at 3 uses, and disabled entirely when notes are present.** The
  notes *are* the context; searching alongside them adds pages of injected results that
  displace the very notes that should be driving the page.
- **Prompt caching on the system prefix.** The breakpoint sits on the second block so
  the guidelines and the JSON contract cache together — the guidelines file alone is
  near the ~1024-token minimum and might not qualify. Note this makes a cold one-off
  generation marginally *more* expensive (the write is 1.25x), and that the two paths
  don't share a cache entry because tools render before system in the prefix.
- **Token and cost logging per generation** (`src/lib/usage.ts`), accumulated across
  `pause_turn` resumptions and retries, logged on failure paths too.
- Measured after: $0.0495 with notes, $0.1193 without. Adding the glossary later raised
  the with-notes figure to ~$0.13 — entirely output tokens, since the glossary is more
  text to write. `output_config.effort` is the remaining lever.

## Notes-to-homepage generation and UI

The app itself: a form, a server action that calls Claude, brand resolution, an iframe
preview, and Copy HTML.

- **`resolveBrand` and content generation run in parallel**, not as one prompt.
  `resolveBrand` never rejects, so a failed color lookup can never take the generation
  down with it — colors degrade branding, they don't invalidate content.
- **`renderHomepage` is pure, so the client can call it.** Editing a swatch or a tag
  href re-renders the preview in the browser with no API call. The client bundle
  contains neither zod nor the Anthropic SDK.
- **Validate → retry once with the Zod errors → surface.** A second failure reports the
  errors rather than degrading silently: a homepage that quietly ignored the content
  guidelines is worse than no homepage.
- **`DiscoverySource` is a discriminated union behind an adapter** so HubSpot can be
  added without restructuring the pipeline. `resolveDiscovery` is async for the same
  reason — a CRM fetch will not be instant.
- **The model never emits a `tagHref`.** Tag page ids are added by hand; a made-up id is
  worse than no link.
- `NAV_HREF` lives in its own dependency-free module so the schema, the HTML validator,
  and the browser form share one rule without pulling zod into the client bundle.

## Homepage template and Froala validator

`src/templates/homepage.ts` renders a validated `DemoPackage`; `src/templates/validate.ts`
checks the output against the checklist in [froala-notes.md](froala-notes.md).

- Tables only, explicit `<tbody>`, headings as `<span>` with inline `font-size`, no class
  or id of our own, sections separated by a bare `<br>`.
- **`display` is on the allowed-property list, so a property-name check alone would pass
  `display:flex`** — which "tables only" forbids. The validator checks the value too.
- **The invented-UUID rule is enforceable, not advisory.** A validator cannot tell a
  fabricated UUID from a real one, so any UUID-shaped image src is rejected unless the
  caller passes it in `knownImageSrcs` as coming from a recorded upload. The default
  logo placeholder is deliberately *not* UUID-shaped, so it is obvious in the editor.
- Later loosened for tag pages: any `#nav/...` route including query strings, with
  `http(s)`, `javascript:`, protocol-relative and bare `#nav/` still rejected.

## DemoPackage Zod schema

`src/lib/schema.ts` plus `npm run check:schema`. The boundary the model's output has to
cross.

- **Mechanically checkable guidelines are enforced here rather than hoped for**: exactly
  3 cards with distinct titles, tagline of 3–5 words (ignoring `•` separators), the
  guideline-8 buzzword ban, purpose paragraphs capped at 250 characters, hex-validated
  brand colors.
- **No HTML in any field**, which enforces the architecture rule — a `<span>` sneaking
  through the prompt fails validation instead of reaching the template.
- Judgment that can't be mechanized — tone, whether the card pattern was the right call
  — is left to the model, as the content guidelines intend.
- **The sample fixture uses a fictional company on purpose.** Guideline 8 forbids stating
  customer-specific facts not in discovery notes, and a checked-in fixture full of
  invented details about a real prospect is exactly that risk.
