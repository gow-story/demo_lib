# Changelog

What has been built, newest first. Each entry records what it does and any decision
that isn't obvious from reading the code. This is where the reasoning that would
otherwise go in a long commit message lives — commit messages stay to one line.

---

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
