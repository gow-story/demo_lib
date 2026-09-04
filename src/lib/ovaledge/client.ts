import 'server-only';

/**
 * OvalEdge term API client.
 *
 * Every constraint here was confirmed against a live tenant — see
 * docs/ovaledge-api-notes.md. Read that before changing anything in this file;
 * several of the rules below look arbitrary and are not.
 */

export interface OvalEdgeTerm {
  /** Always the one demo domain. Domains cannot be created through this API. */
  domainName: string;
  termName: string;
  businessDescription: string;
  action: 'add';
  detailDescription?: string;
  definition?: string;
  examples?: string;
  // `steward`, `owner`, and `custodian` are accepted by the API but deliberately
  // absent from this type: governance roles auto-fill from the token identity,
  // and setting them fights the server.
  //
  // `category` is absent for a harder reason — passing one that does not already
  // exist fails with "Invalid combination of [domainId]: N and [category]: X",
  // and categories cannot be created here either.
}

export interface CreatedTerm {
  termId: number;
  termName: string;
}

export interface AddTermsResult {
  termIds: number[];
  created: CreatedTerm[];
  /** Whatever the API put in `response.logsList`, for surfacing detail. */
  logs: unknown[];
}

export class OvalEdgeError extends Error {
  // Declared explicitly rather than as a constructor parameter property:
  // parameter properties need code generation, and Node's type stripping —
  // which the check scripts run on — only erases.
  readonly detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'OvalEdgeError';
    this.detail = detail;
  }
}

interface OvalEdgeEnv {
  host: string;
  userToken: string;
  userSecret: string;
  domain: string;
}

function readEnv(): OvalEdgeEnv {
  const host = process.env.OVALEDGE_HOST?.trim();
  const userToken = process.env.OVALEDGE_USER_TOKEN?.trim();
  const userSecret = process.env.OVALEDGE_USER_SECRET?.trim();
  const domain = process.env.OVALEDGE_DEMO_DOMAIN?.trim();

  const missing = [
    !host && 'OVALEDGE_HOST',
    !userToken && 'OVALEDGE_USER_TOKEN',
    !userSecret && 'OVALEDGE_USER_SECRET',
    !domain && 'OVALEDGE_DEMO_DOMAIN',
  ].filter(Boolean);

  if (missing.length) {
    throw new OvalEdgeError(
      `Missing environment variable(s): ${missing.join(', ')}. Add them to .env.local and restart.`,
    );
  }

  return {
    host: host!.replace(/\/+$/, ''),
    userToken: userToken!,
    userSecret: userSecret!,
    domain: domain!,
  };
}

/* ------------------------------------------------------------------ *
 * Token minting
 *
 * The JWT is short-lived — its `exp` claim lands the same day — so it
 * cannot be pasted into the environment. The long-lived credentials are
 * exchanged for one on demand and the result is cached in module memory
 * until just before it lapses.
 *
 * Nothing in here logs the token or the credentials, and neither ever
 * appears in an error message.
 * ------------------------------------------------------------------ */

/** Re-mint this long before `exp`, rather than waiting for a 401. */
const REFRESH_MARGIN_MS = 60_000;

/** Used only when a minted token carries no readable `exp`. */
const FALLBACK_TTL_MS = 5 * 60_000;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

/**
 * Module-scoped, so the cache lives as long as the server process. It resets on
 * a dev-server reload and is per-instance in production — both fine, since a
 * cold start just mints again.
 */
let cached: CachedToken | null = null;
/** The one in-flight mint, shared by every caller that arrives during it. */
let inFlight: Promise<CachedToken> | null = null;

function looksLikeJwt(value: string): boolean {
  return value.startsWith('eyJ') && value.split('.').length === 3;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Milliseconds-since-epoch of the `exp` claim, or null if unreadable. */
function expiryFromJwt(jwt: string): number | null {
  try {
    const payload = JSON.parse(base64UrlDecode(jwt.split('.')[1])) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Exchanges the long-lived credentials for a JWT.
 *
 * Two things about this endpoint: it takes NO authorization header (it is the
 * bootstrap), and it returns the raw token as plain text — not JSON. Calling
 * `.json()` on the response fails.
 */
async function mintToken(): Promise<string> {
  const { host, userToken, userSecret } = readEnv();
  const url = `${host}/api/user/token/generate`;

  // The URL, not just the host: a mint failure is almost always about the exact
  // string being requested, and reconstructing it from OVALEDGE_HOST by hand is
  // how an afternoon gets spent. Safe to print — it carries no credential.
  console.log(`[ovaledge] POST ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      // No authorization header — this is what produces the credential.
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userToken, userSecret }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new OvalEdgeError(
      `Could not reach OvalEdge to mint a token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = (await response.text()).trim();

  if (!response.ok) {
    // A 404 from this endpoint does not mean the path is wrong. Verified against
    // the live tenant: the same URL returns a JWT for a good credential pair and
    // 404 with a generic "unexpected issue / insufficient permissions" body for a
    // pair OvalEdge does not recognise. It never answers 401 here. So a 404 points
    // at the credentials first and the host second, not the other way round.
    const hint =
      response.status === 404
        ? 'OvalEdge answers 404 here when it does not recognise the credential pair, so check OVALEDGE_USER_TOKEN and OVALEDGE_USER_SECRET first, then OVALEDGE_HOST.'
        : 'Check OVALEDGE_USER_TOKEN and OVALEDGE_USER_SECRET.';
    throw new OvalEdgeError(
      `Token mint failed with HTTP ${response.status} for POST ${url}. ${hint}`,
      // Safe to include: a non-2xx body is an error message, not a token.
      text.slice(0, 500),
    );
  }

  if (!looksLikeJwt(text)) {
    // Deliberately withholding the body. It should be a token, and if the
    // shape check is what is wrong, echoing it would leak the credential.
    throw new OvalEdgeError(
      `Token mint returned ${text.length} characters that were not a JWT. Expected plain text starting "eyJ" with two dots.`,
    );
  }

  return text;
}

async function mintAndCache(): Promise<CachedToken> {
  const token = await mintToken();
  const expiresAtMs = expiryFromJwt(token) ?? Date.now() + FALLBACK_TTL_MS;
  cached = { token, expiresAtMs };
  return cached;
}

/** The cached token if it is still comfortably valid, else null. */
function usableToken(): string | null {
  if (cached && cached.expiresAtMs - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }
  return null;
}

/**
 * Starts a mint, or joins the one already running. Two requests arriving with
 * an empty cache share a single exchange rather than firing two.
 */
function mintOnce(): Promise<CachedToken> {
  inFlight ??= mintAndCache().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function getToken(): Promise<string> {
  return usableToken() ?? (await mintOnce()).token;
}

/**
 * Replaces a token the server rejected.
 *
 * Takes the rejected value so that a burst of concurrent 401s does not each
 * trigger their own mint: whoever refreshed first wins, and the rest pick up
 * the new token instead of discarding it.
 */
async function refreshRejectedToken(rejected: string): Promise<string> {
  if (cached?.token === rejected) cached = null;
  return usableToken() ?? (await mintOnce()).token;
}

/**
 * Fetch with a minted token, retrying exactly once on a 401.
 *
 * This is the only retry in the client, and it does not contradict the
 * no-retry-on-writes rule: a 401 is rejected at the door, so the write did not
 * happen and re-issuing it cannot duplicate anything. Ambiguous failures —
 * timeouts, 5xx — are still never retried, because those may have landed.
 */
async function authorizedFetch(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<Response> {
  const send = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        // Literal lowercase "jwt", one space, then the token. Not "Bearer".
        authorization: `jwt ${token}`,
      },
    });

  const token = await getToken();
  const response = await send(token);
  if (response.status !== 401) return response;

  // One fresh mint, one retry. A second 401 means the credentials are wrong,
  // and that surfaces to the caller rather than looping.
  return send(await refreshRejectedToken(token));
}

/** The single domain every generated term lands in. */
export function demoDomain(): string {
  return readEnv().domain;
}

interface AddTermResponseBody {
  status?: unknown;
  statusCode?: unknown;
  statusMsg?: unknown;
  response?: {
    logsList?: unknown;
    response?: unknown;
  };
}

/**
 * Posts every term in a single batch and returns the created ids.
 *
 * No retries, by design. The API has no upsert and no idempotency key, so
 * retrying an ambiguous failure risks a duplicate set of terms in a glossary
 * someone then has to clean up by hand. A failed publish surfaces.
 */
export async function addTerms(terms: OvalEdgeTerm[]): Promise<AddTermsResult> {
  if (terms.length === 0) {
    throw new OvalEdgeError('No terms to publish.');
  }

  const { host } = readEnv();
  const url = `${host}/api/term/addTerm/v2`;

  let response: Response;
  try {
    response = await authorizedFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(terms),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    // `authorizedFetch` mints a token first, so anything the mint raises passes
    // through here. Those are already OvalEdgeErrors carrying a finished message —
    // wrapping one produced "Could not reach OvalEdge at HOST: Token mint failed
    // … for POST HOST/api/user/token/generate", naming the host twice and blaming
    // the network for something that was a clean HTTP response. Rethrow as-is;
    // only wrap the transport failures this catch was actually written for.
    if (error instanceof OvalEdgeError) throw error;
    throw new OvalEdgeError(
      `Could not reach OvalEdge at ${url}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  const text = await response.text();

  if (response.status === 401) {
    // Already retried with a freshly minted token inside authorizedFetch.
    throw new OvalEdgeError(
      'OvalEdge rejected a freshly minted token (HTTP 401). Check OVALEDGE_USER_TOKEN and OVALEDGE_USER_SECRET.',
    );
  }

  if (!response.ok) {
    throw new OvalEdgeError(
      `OvalEdge returned HTTP ${response.status}.`,
      text.slice(0, 2000),
    );
  }

  let body: AddTermResponseBody;
  try {
    body = JSON.parse(text) as AddTermResponseBody;
  } catch {
    throw new OvalEdgeError(
      'OvalEdge returned a response that was not JSON.',
      text.slice(0, 2000),
    );
  }

  // Failures come back as HTTP 200 with status:false. Checking response.ok
  // alone would report success on every error the API produces.
  if (body.status === false) {
    throw new OvalEdgeError(
      typeof body.statusMsg === 'string' && body.statusMsg.trim()
        ? `OvalEdge rejected the request: ${body.statusMsg}`
        : 'OvalEdge rejected the request without a message.',
      body,
    );
  }

  // Per-term results are double-nested: response.response, not response.
  const inner = body.response?.response;
  if (!Array.isArray(inner)) {
    throw new OvalEdgeError(
      'OvalEdge accepted the request but returned no per-term results.',
      body,
    );
  }

  const created: CreatedTerm[] = [];
  for (const [index, entry] of inner.entries()) {
    const record = entry as { termId?: unknown; termName?: unknown };
    if (typeof record.termId !== 'number') continue;
    created.push({
      termId: record.termId,
      termName:
        typeof record.termName === 'string' && record.termName.trim()
          ? record.termName
          : (terms[index]?.termName ?? `term ${record.termId}`),
    });
  }

  if (created.length === 0) {
    throw new OvalEdgeError(
      'OvalEdge accepted the request but returned no term ids.',
      body,
    );
  }

  return {
    termIds: created.map((term) => term.termId),
    created,
    logs: Array.isArray(body.response?.logsList) ? body.response.logsList : [],
  };
}
