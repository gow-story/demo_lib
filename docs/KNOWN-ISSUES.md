# Known Issues and Constraints

Things that do not work, and things that work only one way. Each entry has enough detail
to stop someone re-investigating it. If you find one of these is no longer true, say so
here rather than quietly working around it.

---

## Term relationships cannot be created via the API

**Endpoint:** `POST /businessglossary/term/related/add`

Authenticating with a JWT does not work. The endpoint returns an **HTML login page**
rather than JSON — the JWT is accepted at the transport level and then ignored, because
this route is authenticated by browser session, not by bearer token. There is no error
message; the tell is that the response body is HTML.

This is not the same auth model as `/api/term/addTerm/v2`, which is JWT-authenticated and
works fine. Do not assume an endpoint takes a JWT because a neighbouring one does.

**Current behaviour:** the SE links related terms by hand in the OvalEdge UI after
publishing. The app makes that as cheap as it can: the hero metric is generated as a
derived metric whose components are terms in the same glossary, and after a successful
publish the UI lists the exact links to create — `Fuel Margin (1234) → Fuel Revenue (1235)`
— with the created termIds beside each name, since finding a term by name in the OvalEdge
UI is the slow part.

## Domains and categories cannot be created via the API — only referenced

Passing a category that does not already exist fails with:

```
Invalid combination of [domainId]: 1062 and [category]: <name>
```

Consequences, encoded in `src/lib/ovaledge/client.ts`:

- Every generated term goes into one fixed domain, read from `OVALEDGE_DEMO_DOMAIN`.
- **No `category` field is sent at all** — not empty, not null, the key is absent.
  `OvalEdgeTerm` deliberately has no `category` property so it cannot be added back by
  accident.
- The SE reorganizes into real domains and categories in the UI afterwards. That is the
  intended workflow, not a limitation to engineer around.

## Terms publish as DRAFT with no category — by design

Nothing in this app auto-publishes a term to an approved state, and nothing assigns a
category. This is deliberate, not an oversight: generated content gets reviewed by a
human before it becomes part of a customer-facing glossary.

Governance roles (`steward`, `custodian`, `governancerole4`) auto-fill from the token's
identity. They are accepted by the API but must not be set — writing them fights the
server. `OvalEdgeTerm` omits them for the same reason it omits `category`.

## Logo upload requires a browser session

**Fetching the logo is now automatic. Uploading it is still manual.**

`resolveBrand` finds the logo while it is already reading the site — apple-touch-icon,
then favicon, then og:image as a last resort — preferring SVG/PNG over ICO and larger over
smaller within each source. It is fetched server-side and returned as a data URI so the
browser can display and download it without a cross-origin request. Failure is silent by
design: no logo means the section says so and everything else proceeds.

Uploading is what remains blocked.

**Endpoint:** `POST /wikicontroller/setWikiImage`

Needs an `X-Csrf-Token` header **and** a session cookie — not an API key, not a JWT. It is
also scoped to an existing object via `objectId`, so there is no upload-first,
attach-later flow: a story or page must already exist before an image can be uploaded
into it.

Automating this means either scripting a login and refreshing the session, or real
browser automation. Both are a step up in fragility.

**Current behaviour:** the generated HTML ships an `<img>` with a clearly marked
placeholder src (`ovaledgeimages/editorimage/UPLOAD-LOGO-THEN-PASTE-REAL-UUID-HERE`). The
SE downloads the fetched logo from the UI, uploads it in the OvalEdge editor, and replaces
that placeholder with the returned UUID path. The UI names the placeholder string verbatim
so it can be searched for in the pasted HTML.

**Why `og:image` is last:** it was tried first initially, and on many sites it is a social
share card sized for a link preview rather than a mark — stripe.com returned a 305 KB JPEG
banner, which is the wrong asset for the template's 190px slot. The touch icon and the
favicon are almost always the real logo, so they take priority even though they are
smaller; with the order reversed, Stripe resolves to a ~400 byte `favicon.svg`. `og:image`
remains as a last resort for sites that declare neither.

The UI still shows which source matched along with the type and size, so a wrong asset
stays visible rather than silently used. Priority is the order of the `LOGO_SOURCES` array
in `src/lib/brand.ts` and nothing else.

Related: **never invent an image UUID.** A fabricated one renders as a broken image with
no visible error in the editor. The placeholder is deliberately not UUID-shaped so it is
obvious, and the Froala validator rejects any UUID-shaped src that did not come from a
recorded upload.

## Brand extraction reads hex colors only

`resolveBrand` scrapes `#rgb` / `#rrggbb` from the page markup and up to three
same-origin stylesheets. It does **not** read:

- `rgb()` / `rgba()` / `hsl()` values
- CSS custom properties (`--brand-primary: …`) where the value is defined elsewhere
- colors in external stylesheets on a different origin, or applied by JavaScript

A site built entirely on those falls through to the neutral palette. This is visible
rather than silent: the UI reports how many of the four roles were filled and where they
came from, and the swatches are editable.

Two related limits:

- **A domain is required.** Without one there is nothing to fetch, so the neutral palette
  is returned with a note saying so. The app does not guess a URL from the company name —
  a wrong guess would apply a stranger's colors with no signal that it had.
- **Role assignment is not top-four-by-frequency.** Each role only considers colors that
  can do its job, with `primary` requiring 4.5:1 contrast against white. A site whose
  frequent colors are all pale will fill fewer than four roles and keep neutral defaults
  for the rest.

## OvalEdge errors arrive as HTTP 200

A failed call still returns HTTP 200 with `{ "status": false, "statusMsg": "..." }`.
Checking `response.ok` alone reports success on every error the API produces. Always
branch on the `status` field. See [ovaledge-api-notes.md](ovaledge-api-notes.md).

## The OvalEdge JWT expires the same day

Its `exp` claim lands the same day it is issued, which is why there is no `OVALEDGE_JWT`
environment variable — a pasted token is dead by the next morning. The client mints one
from `OVALEDGE_USER_TOKEN` / `OVALEDGE_USER_SECRET` on demand.

The mint endpoint (`POST /api/user/token/generate`) takes **no** `Authorization` header
and returns the raw JWT as **plain text, not JSON**. Calling `.json()` on it fails.

## A 404 from the mint endpoint means the credentials, not the path

`POST /api/user/token/generate` answers **HTTP 404** — not 401 — when OvalEdge does not
recognise the `userToken` / `userSecret` pair. The body is a generic "An unexpected issue
occurred while processing your request… or insufficient permissions", which says nothing
about which of the two it is.

Confirmed against the live tenant: the identical URL returns a JWT for a good pair and
404 for a bad one, from `curl` and from Node's `fetch` alike. So a 404 here is not a
signal to go hunting for a wrong path or a mangled `OVALEDGE_HOST` — check the credential
pair in `.env.local` first. The client logs the exact URL it requests (`[ovaledge] POST
…`) so the path can be ruled out in one glance rather than by reconstructing it.

## Publishing is not idempotent

`POST /api/term/addTerm/v2` has no upsert and no idempotency key. Publishing the same
glossary twice creates a duplicate set of terms that someone cleans up by hand.

This is why there is no retry on writes, and why the publish button disables after
success. The one exception is a 401, which is retried once after a fresh mint — a 401 is
rejected at the door, so the write never happened. Ambiguous failures (timeouts, 5xx) are
never retried, because those may have landed.

## Node type stripping only erases

The check scripts run on `node --experimental-strip-types`, which removes type syntax but
does not generate code. Constructor parameter properties, enums, and namespaces all fail
at runtime with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.

`"erasableSyntaxOnly": true` in `tsconfig.json` catches this at typecheck time instead.
Relatedly, runtime imports inside `src/lib/` need explicit `.ts` extensions — Node's ESM
resolver does no extensionless resolution. Type-only imports are erased and don't need
them.
