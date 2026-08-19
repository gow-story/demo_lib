# Homepage Content Guidelines

Feeds the Claude system prompt that generates the `DemoPackage` JSON.

**This file is judgment only — what to say, never how to render it.** All markup, CSS, fonts,
and image syntax live in the template and are validated against `docs/froala-notes.md`. The
model that generates the spec never sees HTML and never writes any — it fills JSON fields.

---

## 1. Goal

The homepage should make the prospect think "they understood what we're trying to solve" —
not "they used our logo and colors." Branding creates familiarity; discovery-call context
creates relevance. Relevance is what actually lands.

It should NOT feel like: a generic OvalEdge page, an industry template with the name swapped,
a technical architecture page, or an exhaustive capability list.

## 2. Weighting inputs

Discovery-call notes outweigh the company website. The website informs branding, terminology,
and industry context. The discovery call decides what the homepage actually emphasizes.

## 3. Choosing the three-card pattern

Two valid patterns for the three main cards — pick one, don't blend them:

- **Governance-focus.** What the customer wants to *accomplish*: Data Discovery & Literacy,
  Governance at Scale, AI-Ready Trusted Data, Governed Data Access. Fits when discovery notes
  center on capability questions — how do we classify, trace lineage, scale with a small team,
  prep for AI.
- **Business-area.** What data the customer *has*: e.g. Fuel & Petroleum, Food & Convenience
  Retail, Real Estate. Fits when the homepage should visually map the customer's business
  domains rather than governance capabilities.

**Never mix the two levels** (e.g. "Customer Data / Data Lineage / AI Readiness" mixes
what-they-have with what-they-want).

## 4. Hero content

- Title: customer name + governance framing, e.g. *"[Company] Data Governance Hub"* or
  *"[Company] Enterprise Data Governance Hub."* Avoid generic titles like "Welcome to
  OvalEdge."
- Tagline: a short phrase reflecting the customer's priorities — 3–5 words, often a sequence
  (e.g. *"Discover • Classify • Trace • Govern"*).
- Badge: one short positioning statement, not marketing copy.

## 5. Card copy density

Title + one short sentence per card. No bullet lists, no technical specs, no connector
inventories.

## 6. Purpose section — two paragraphs

Paragraph 1: the customer's actual situation/challenge, in their terms.
Paragraph 2: how the governance environment addresses it. No feature-dumping, no competitor
comparison, no implementation detail.

## 7. Footer statement

One short, conclusive sentence summarizing the demo's theme — a conclusion, not a slogan
invented for flair.

## 8. Guardrails — never do these

- Never invent connector support, deployment support, certifications, or integrations.
- Never state a customer-specific fact not present in discovery notes or public info.
- Avoid buzzwords: "unlock value," "unleash insights," "democratize data," "revolutionize."
- Avoid AI-hype phrasing ("autonomous governance," "cognitive data fabric") unless discovery
  notes specifically use that language. Prefer concrete: "AI-ready data," "governed business
  context."

## 9. Tone

Tailored, credible, simple, business-oriented, polished. Not over-engineered, promotional,
buzzword-heavy, or generic.

## 10. Core principle

Success is the prospect recognizing their own problem in the page — not recognizing their
logo.

---

## Schema implications for `DemoPackage`

```
homepage: {
  cardPattern: 'governance-focus' | 'business-area'
  hero: { title, tagline, badge }
  purpose: { challenge, solution }          // the two paragraphs
  cards: [{ title, description }]           // exactly 3
  footerStatement: string
}
```

Everything above is a judgment call the model makes when filling these fields. The HTML that
renders them is fixed, tested, and lives entirely in the template.
