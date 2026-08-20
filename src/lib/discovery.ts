/**
 * Where discovery context comes from.
 *
 * The pipeline downstream of `resolveDiscovery` only ever sees resolved notes
 * text — it does not know or care whether a human pasted them or they were
 * pulled from a CRM. Adding HubSpot means adding a variant here and a case in
 * the switch below; nothing else moves.
 */
export type DiscoverySource =
  | { kind: 'notes'; text: string }
  | { kind: 'none' }
  // later: | { kind: 'hubspot'; dealId: string }
  ;

export interface ResolvedDiscovery {
  /** Empty when there is no discovery context to work from. */
  notes: string;
  /** Short human-readable provenance, shown in the UI and the prompt. */
  origin: string;
}

/**
 * Async on purpose: a notes paste resolves instantly, but a CRM fetch will not,
 * and callers should already be awaiting this so that change stays local.
 */
export async function resolveDiscovery(
  source: DiscoverySource,
): Promise<ResolvedDiscovery> {
  switch (source.kind) {
    case 'notes': {
      const notes = source.text.trim();
      return notes
        ? { notes, origin: 'pasted discovery notes' }
        : { notes: '', origin: 'no discovery notes' };
    }
    case 'none':
      return { notes: '', origin: 'no discovery notes' };
  }
}
