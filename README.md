# Demo Lib

Turns discovery-call notes into a demo homepage and business glossary for a prospect's
OvalEdge tenant.

Paste in a company name and your notes from the call. Demo Lib generates the homepage
copy and a 6–8 term glossary, extracts the prospect's brand colors from their website,
renders HTML that survives the OvalEdge editor, and publishes the glossary terms to your
tenant. You copy the HTML into the homepage editor yourself; nothing is written to
OvalEdge without an explicit click.

## Prerequisites

- **Node 22 or newer.** The check scripts run TypeScript through Node's type stripping.
- **An Anthropic API key.** Generation costs roughly $0.13 per run.
- **OvalEdge profile credentials** — the user token and secret from the credentials
  download on your OvalEdge user profile. Not a JWT: those expire the same day, so the
  app mints its own.

## Setup

```bash
npm install
npm run dev
```

Create a `.env.local` with the variables below before the first run, then open
http://localhost:3000.

### Environment variables

All of these go in `.env.local`, which is gitignored. Never commit values.

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `OVALEDGE_HOST` | Tenant base URL, e.g. `https://<tenant>.ovaledge.cloud` |
| `OVALEDGE_USER_TOKEN` | From your OvalEdge profile credentials download |
| `OVALEDGE_USER_SECRET` | From the same download |
| `OVALEDGE_DEMO_DOMAIN` | The one glossary domain generated terms land in |

Terms publish as **DRAFT** with no category, into that single domain. Reorganizing them
into real domains and categories is a manual step in the OvalEdge UI — the API cannot
create either. See [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

## Checks

```bash
npm run check:schema      # content guardrails and OvalEdge payload constraints
npm run check:template    # renders the sample package, validates the generated HTML
npx tsc --noEmit
npx eslint .
```

Both check scripts must pass before a change lands. Neither makes a network call.

## Docs

- [docs/CHANGELOG.md](docs/CHANGELOG.md) — what has been built and why
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's next
- [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md) — constraints and dead ends worth not re-investigating
- [docs/ovaledge-api-notes.md](docs/ovaledge-api-notes.md) — auth, the term API, hard constraints
- [docs/froala-notes.md](docs/froala-notes.md) — the HTML vocabulary the OvalEdge editor preserves
- [docs/homepage-content-guidelines.md](docs/homepage-content-guidelines.md) — what the generated copy should say

`CLAUDE.md` holds the architecture rules and boundaries for working in this repo.
