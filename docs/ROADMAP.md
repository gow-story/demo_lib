# Roadmap

Roughly ordered. Not a commitment — the ordering reflects what unblocks demo quality
soonest, not what is most interesting to build.

See [KNOWN-ISSUES.md](KNOWN-ISSUES.md) for the constraints several of these run into.

---

## 1. Hero metric as a derived metric with component terms

Today the hero metric's formula, components, mistakes and practices are text that merges
into one `detailDescription` at the API boundary. The components should instead be real
glossary terms in their own right, with the hero metric related to them — so the demo can
walk from the metric down into its inputs.

Blocked on term relationships, which cannot be created through the API — see
[KNOWN-ISSUES.md](KNOWN-ISSUES.md). Until that changes, the components exist as prose and
the SE links them by hand. Worth deciding whether to generate the component terms as
separate glossary entries anyway, so the manual linking is a few clicks rather than
authoring.

## 2. Loading experience for the ~60s generation

Generation takes 40–110s depending on whether web search runs. The UI currently shows a
static "Searching and generating…" and nothing else, which reads as a hang.

Options worth weighing: streaming the response so sections appear as they arrive, or a
staged progress indicator driven by what the server action is actually doing (brand
extraction finishes in about a second and could report early). Streaming changes the
validate-retry loop, so it is not a free swap.

## 3. Tighter copy

Cards and purpose paragraphs still run long even under the 250-character cap. The cap
stopped the worst of it but the copy is still wordier than a slide deserves.

Two levers, both cheap to try: lower `output_config.effort` from `high`, and tighten the
length caps further. Output tokens are now ~88% of generation cost, so this is also the
main remaining cost lever — measure both together.

## 4. HubSpot integration

Pull discovery context from a deal rather than a paste. The pipeline is already shaped
for it: `DiscoverySource` is a discriminated union with a `hubspot` variant commented in
place, and `resolveDiscovery` is async precisely so a CRM fetch fits without touching
callers.

Work is the adapter and the auth, not the pipeline.

## 5. Multi-user access and deployment to Render

Currently single-user and local. Deployment raises two things the app does not handle:

- Credentials are per-user. `OVALEDGE_USER_TOKEN` / `OVALEDGE_USER_SECRET` come from an
  individual's profile download, and governance roles auto-fill from whoever the token
  belongs to — so terms would be attributed to whoever's credentials are in the
  environment, not the SE who generated them.
- The JWT cache is module-scoped and per-instance, which is fine for one process but
  becomes per-user state that must not be shared once there are several.

## 6. Logo upload automation

The generated HTML ships an `<img>` with a marked placeholder src that the SE replaces by
hand after uploading. Automating it means driving `setWikiImage`, which needs a CSRF
token and a session cookie and is scoped to an existing `objectId` — see
[KNOWN-ISSUES.md](KNOWN-ISSUES.md).

This is deliberately last. It needs either a scripted login with session refresh or real
browser automation, and both are a meaningful step up in fragility for a step the SE
currently does in about thirty seconds.
