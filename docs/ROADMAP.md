# Roadmap

Roughly ordered. Not a commitment — the ordering reflects what unblocks demo quality
soonest, not what is most interesting to build.

See [KNOWN-ISSUES.md](KNOWN-ISSUES.md) for the constraints several of these run into.

---

## 1. Loading experience for the ~60s generation

Partly done — the wait now shows real stages and a rotating observation. What remains is
the retry: when generation needs a second attempt the user waits through another model
call with no sign of it, because mid-flight phases would need a streamed server action.
See the changelog entry on the progress UI.

Generation takes 40–110s depending on whether web search runs. The UI currently shows a
static "Searching and generating…" and nothing else, which reads as a hang.

Options worth weighing: streaming the response so sections appear as they arrive, or a
staged progress indicator driven by what the server action is actually doing (brand
extraction finishes in about a second and could report early). Streaming changes the
validate-retry loop, so it is not a free swap.

## 2. Tighter copy

Cards and purpose paragraphs still run long even under the 250-character cap. The cap
stopped the worst of it but the copy is still wordier than a slide deserves.

Two levers, both cheap to try: lower `output_config.effort` from `high`, and tighten the
length caps further. Output tokens are now ~88% of generation cost, so this is also the
main remaining cost lever — measure both together.

## 3. HubSpot integration

Pull discovery context from a deal rather than a paste. The pipeline is already shaped
for it: `DiscoverySource` is a discriminated union with a `hubspot` variant commented in
place, and `resolveDiscovery` is async precisely so a CRM fetch fits without touching
callers.

Work is the adapter and the auth, not the pipeline.

## 4. Multi-user access and deployment to Render

Currently single-user and local. Deployment raises two things the app does not handle:

- Credentials are per-user. `OVALEDGE_USER_TOKEN` / `OVALEDGE_USER_SECRET` come from an
  individual's profile download, and governance roles auto-fill from whoever the token
  belongs to — so terms would be attributed to whoever's credentials are in the
  environment, not the SE who generated them.
- The JWT cache is module-scoped and per-instance, which is fine for one process but
  becomes per-user state that must not be shared once there are several.

## 5. Logo upload automation

The generated HTML ships an `<img>` with a marked placeholder src that the SE replaces by
hand after uploading. Automating it means driving `setWikiImage`, which needs a CSRF
token and a session cookie and is scoped to an existing `objectId` — see
[KNOWN-ISSUES.md](KNOWN-ISSUES.md).

This is deliberately last. It needs either a scripted login with session refresh or real
browser automation, and both are a meaningful step up in fragility for a step the SE
currently does in about thirty seconds.
