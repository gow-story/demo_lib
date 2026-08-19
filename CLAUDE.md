# Demo Lib

Turns discovery-call notes into OvalEdge-ready HTML for demo homepages.

## Stack
Next.js 16, App Router only, TypeScript strict, Tailwind.
Never create a `pages/` directory. Never use getServerSideProps or getStaticProps.

## Architecture rule
Notes -> DemoPackage JSON (Zod-validated) -> HTML template -> user copies into OvalEdge.
The LLM produces JSON only. It never writes HTML.
All HTML comes from templates in `src/templates/`.

## Boundaries
Server components by default. "use client" only for interactivity.
The Anthropic API is called only from server actions. Never from a client component.

## HTML constraints
Output must survive the OvalEdge Froala editor. See docs/froala-notes.md.
No <script>, no <style> blocks, no external image src. Inline styles only.

## Content guidance
See docs/homepage-content-guidelines.md for what the generated copy should say.

## Commands
npm run dev / npm run build / npx tsc --noEmit
