# OvalEdge API Notes

Ground truth: every call below was verified with curl against a live tenant. The
constraints are not guesses — they were found by hitting the API and reading what came
back. Encode them; don't rediscover them.

## Auth

```
Authorization: jwt <token>
Content-Type: application/json
```

The scheme prefix is the literal lowercase string `jwt`, then a single space, then the
token. **Not** `Bearer`, not `JWT`. Getting this wrong is the first thing to check when
a call fails for no obvious reason.

Config comes from the environment:

```
OVALEDGE_HOST          e.g. https://<tenant>.ovaledge.cloud
OVALEDGE_USER_TOKEN    long-lived, from the OvalEdge profile credentials download
OVALEDGE_USER_SECRET   long-lived, from the same download
OVALEDGE_DEMO_DOMAIN   the one domain generated terms land in
```

### The JWT is short-lived — mint it, don't paste it

The JWT's `exp` claim lands the **same day** it is issued. A token pasted into the
environment works this afternoon and is dead tomorrow morning, which is why there is no
`OVALEDGE_JWT` variable. The long-lived pair is the user token and secret, downloaded
from the credentials section of an OvalEdge user profile; the client exchanges them for
a JWT on demand.

```
POST {OVALEDGE_HOST}/api/user/token/generate
Content-Type: application/json

{ "userToken": "...", "userSecret": "..." }
```

**This endpoint takes no `Authorization` header.** It is the bootstrap — it is what
produces the credential, so sending one is a mistake.

**The response is the raw JWT as plain text, not JSON.** Calling `.json()` on it fails.
Read it with `response.text()`. A valid token starts with `eyJ` and contains two dots.

How the client handles it (`src/lib/ovaledge/client.ts`):

- The token is cached in module memory alongside its expiry, read by base64-decoding
  the JWT's middle segment for the `exp` claim.
- It is re-minted **60 seconds before** `exp`, rather than being used until something
  fails.
- Concurrent callers arriving with a cold cache share a single in-flight mint instead of
  each firing their own.
- A `401` from any call triggers one fresh mint and one retry of that call. A second
  `401` surfaces as an error — it means the credentials are wrong, not that the token
  lapsed.
- The token and the credentials are never logged and never appear in an error message.

A 401 retry does not conflict with the no-retry-on-writes rule below: a 401 is rejected
at the door, so the write never happened and re-issuing it cannot duplicate anything.
Ambiguous failures — timeouts, 5xx — are still never retried.

## Creating terms

```
POST {OVALEDGE_HOST}/api/term/addTerm/v2
```

The body is an **array** of term objects — batching is confirmed working, so send every
term in a single call rather than one request per term.

Minimal accepted term object:

```json
{
  "domainName": "Demo",
  "termName": "Net Revenue",
  "businessDescription": "…",
  "action": "add"
}
```

Also accepted: `detailDescription`, `definition`, `examples`, `steward`, `owner`,
`custodian`.

### Response shape

```json
{
  "status": true,
  "statusCode": "...",
  "statusMsg": "...",
  "response": {
    "logsList": [ ... ],
    "response": [ { "termId": 12345, ... }, ... ]
  }
}
```

Note the double nesting: the per-term results are at `response.response`, **not**
`response`. That inner array has one object per submitted term, each carrying a
`termId`. Capture those — they are the only record of what was created.

### Errors arrive as HTTP 200

A failed call still returns **HTTP 200**, with:

```json
{ "status": false, "statusMsg": "<what went wrong>" }
```

So `response.ok` proves nothing. Always branch on the `status` field. A client that
only checks the HTTP status will report success on every failure.

## Hard constraints

**Domains and categories cannot be created through this API.** Passing a category that
does not already exist fails with:

```
Invalid combination of [domainId]: 1062 and [category]: <name>
```

Consequences, which the client encodes:

- Every generated term goes into **one fixed domain**, read from `OVALEDGE_DEMO_DOMAIN`.
- **No `category` field is sent at all.** Not an empty string, not null — the key is
  absent from the payload.
- The SE reorganizes terms into their real domains and categories by hand in the UI
  after the fact. That is the intended workflow, not a limitation to engineer around.

**Terms are created with status DRAFT.** Leave it alone. Nothing in this app should
auto-publish a term to an approved state.

**Governance roles auto-fill from the token's identity.** `steward`, `custodian`, and
`governancerole4` are populated from whoever the JWT belongs to. Do not set them — the
fields exist in the API, but writing them fights the server.

## Write behaviour

No retries on writes. `addTerms` is not idempotent — the API has no upsert and no
request key, so a retry after an ambiguous failure risks a second set of duplicate
terms in the glossary. A failed publish surfaces to the user, who can look at the
domain and decide. This is deliberate.
