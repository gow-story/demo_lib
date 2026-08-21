# Demo Lib

Turns discovery-call notes into an OvalEdge-ready demo homepage and business glossary.

## Stack
Next.js 16, App Router only, TypeScript strict, Tailwind.
Never create a `pages/` directory. Never use getServerSideProps or getStaticProps.

## Architecture rule
Notes -> DemoPackage JSON (Zod-validated) -> HTML template -> user copies into OvalEdge.
The LLM produces JSON only. It never writes HTML.
All HTML comes from templates in `src/templates/`.

## Boundaries
Server components by default. `"use client"` only for interactivity.
The Anthropic API is called only from server actions. Never from a client component.
The same holds for the OvalEdge client. Both are guarded by `import 'server-only'` —
if a client component pulls one in, the build fails rather than leaking a credential.
Nothing writes to OvalEdge without an explicit user click.

## HTML constraints
Output must survive the OvalEdge Froala editor. See [docs/froala-notes.md](docs/froala-notes.md).
No `<script>`, no `<style>` blocks, no external image src. Inline styles only.

## Cost constraints
Generation is one Anthropic call producing both the homepage and the glossary.
Do not add a second call. Web search is capped at 3 uses and disabled entirely when
discovery notes are present — search results are injected into context and re-sent
every turn, which is the main cost lever in the app. Brand colors are extracted
deterministically from the company site, never by a model.

## Validation
`npm run check:schema` and `npm run check:template` must pass before any change lands.
They are the guard on the content guardrails and the Froala vocabulary.

## Commands
```
npm run dev
npm run build
npx tsc --noEmit
npx eslint .
npm run check:schema      # schema rules + OvalEdge payload constraints
npm run check:template    # renders the sample, validates against the Froala checklist
```

## Docs
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — what has been built and why, newest first
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's next
- [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md) — constraints and dead ends, so nobody re-investigates them
- [docs/ovaledge-api-notes.md](docs/ovaledge-api-notes.md) — auth, term API, hard constraints
- [docs/froala-notes.md](docs/froala-notes.md) — the HTML vocabulary that survives the editor
- [docs/homepage-content-guidelines.md](docs/homepage-content-guidelines.md) — what the generated copy should say

## Git
Work directly on `main`. Never create a branch — this is a solo repo with no PR
workflow, and that holds even when a remote is configured.

Never run `git commit` or `git push`, and never stage changes. Leave edits in the
working tree; the repo owner reviews and commits them.

## Changelog
Update [docs/CHANGELOG.md](docs/CHANGELOG.md) as part of any feature work — the entry
carries what changed and the reasoning behind it. Commit messages stay to a single
summary line; the reasoning lives in the changelog, not in the git history.
