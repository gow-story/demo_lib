import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Token and cost accounting for a generation.
 *
 * A generation can span several API calls — a `pause_turn` resumption, or the
 * validation retry — and the cost of each is invisible unless it is added up
 * somewhere. This is that somewhere.
 */

/** Claude Sonnet 4.6, USD per million tokens. */
const INPUT_PER_MTOK = 3.0;
const OUTPUT_PER_MTOK = 15.0;
/** Writing to the 5-minute cache costs 1.25x input; reading costs 0.1x. */
const CACHE_WRITE_PER_MTOK = INPUT_PER_MTOK * 1.25;
const CACHE_READ_PER_MTOK = INPUT_PER_MTOK * 0.1;
/** Server-side web search: $10 per 1,000 searches. */
const PER_WEB_SEARCH = 0.01;

export interface UsageTotals {
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
}

export function emptyUsage(): UsageTotals {
  return {
    apiCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    webSearches: 0,
  };
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    apiCalls: a.apiCalls + b.apiCalls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    webSearches: a.webSearches + b.webSearches,
  };
}

/** Folds one API response into a running total. */
export function recordMessage(
  totals: UsageTotals,
  message: Anthropic.Message,
): UsageTotals {
  const usage = message.usage;

  // The API reports server-tool calls directly; fall back to counting result
  // blocks if that field is absent.
  const reported = usage.server_tool_use?.web_search_requests;
  const searches =
    typeof reported === 'number'
      ? reported
      : message.content.filter((b) => b.type === 'web_search_tool_result').length;

  return addUsage(totals, {
    apiCalls: 1,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    webSearches: searches,
  });
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  webSearch: number;
  total: number;
}

export function costOf(totals: UsageTotals): CostBreakdown {
  const input = (totals.inputTokens / 1_000_000) * INPUT_PER_MTOK;
  const output = (totals.outputTokens / 1_000_000) * OUTPUT_PER_MTOK;
  const cacheWrite = (totals.cacheWriteTokens / 1_000_000) * CACHE_WRITE_PER_MTOK;
  const cacheRead = (totals.cacheReadTokens / 1_000_000) * CACHE_READ_PER_MTOK;
  const webSearch = totals.webSearches * PER_WEB_SEARCH;
  return {
    input,
    output,
    cacheWrite,
    cacheRead,
    webSearch,
    total: input + output + cacheWrite + cacheRead + webSearch,
  };
}

const usd = (value: number) => `$${value.toFixed(4)}`;
const cacheCost = (cost: CostBreakdown) => cost.cacheWrite + cost.cacheRead;

/**
 * One line per generation on the server console, so cost is visible while the
 * work happens rather than at the end of the month.
 */
export function logUsage(label: string, totals: UsageTotals): CostBreakdown {
  const cost = costOf(totals);
  console.log(
    [
      `[cost] ${label}`,
      `calls=${totals.apiCalls}`,
      `in=${totals.inputTokens}`,
      `out=${totals.outputTokens}`,
      `cache_read=${totals.cacheReadTokens}`,
      `cache_write=${totals.cacheWriteTokens}`,
      `searches=${totals.webSearches}`,
      `| tokens=${usd(cost.input + cost.output + cacheCost(cost))}`,
      `search=${usd(cost.webSearch)}`,
      `TOTAL=${usd(cost.total)}`,
    ].join(' '),
  );
  return cost;
}
