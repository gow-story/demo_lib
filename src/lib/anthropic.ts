import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

import { emptyUsage, recordMessage, type UsageTotals } from './usage.ts';

/**
 * Anthropic plumbing. Importing `server-only` here is what enforces the
 * CLAUDE.md boundary: if this module is ever pulled into a client component the
 * build fails rather than shipping the API key to the browser.
 */

/** Requested explicitly for this project (Claude Sonnet 4.6). */
export const MODEL = 'claude-sonnet-4-6';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set — add it to .env.local and restart the dev server.',
    );
  }
  client ??= new Anthropic();
  return client;
}

let guidelines: string | null = null;

/**
 * docs/homepage-content-guidelines.md verbatim. Read from disk rather than
 * copied into a string so the prompt can never drift from the checked-in doc.
 * Cached in module scope — a re-read per request would also mean a new cache
 * prefix only if the bytes changed, but the read itself is pure overhead.
 */
export function contentGuidelines(): string {
  guidelines ??= fs.readFileSync(
    path.join(process.cwd(), 'docs', 'homepage-content-guidelines.md'),
    'utf8',
  );
  return guidelines;
}

export interface ClaudeCallOptions {
  /**
   * System prompt blocks. Put `cache_control` on the last stable block to cache
   * everything before it — see the note in generate-package.ts.
   */
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /**
   * Number of web searches Claude may run this turn. Omit to disable the tool
   * entirely — every search result is injected into context and re-sent on
   * every subsequent turn, so this is the main cost lever in the whole app.
   */
  webSearchMaxUses?: number;
  effort?: 'low' | 'medium' | 'high' | 'max';
  maxTokens?: number;
}

export interface ClaudeCallResult {
  message: Anthropic.Message;
  usage: UsageTotals;
}

/**
 * One logical turn, resuming across `pause_turn` and accounting for every call.
 *
 * A long server-tool turn can stop with `stop_reason: "pause_turn"`; the turn is
 * parked, not finished. Returning that message as-is would hand back a silently
 * truncated answer, so push the paused assistant turn back and continue.
 */
export async function callClaude(
  options: ClaudeCallOptions,
): Promise<ClaudeCallResult> {
  const messages = [...options.messages];
  const tools =
    options.webSearchMaxUses && options.webSearchMaxUses > 0
      ? [
          {
            type: 'web_search_20260209' as const,
            name: 'web_search' as const,
            max_uses: options.webSearchMaxUses,
          },
        ]
      : undefined;

  let usage = emptyUsage();
  let last: Anthropic.Message | null = null;

  for (let turn = 0; turn < 6; turn++) {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: options.maxTokens ?? 16000,
      system: options.system,
      thinking: { type: 'adaptive' },
      output_config: { effort: options.effort ?? 'high' },
      ...(tools ? { tools } : {}),
      messages,
    });

    usage = recordMessage(usage, response);
    last = response;

    if (response.stop_reason !== 'pause_turn') return { message: response, usage };
    messages.push({ role: 'assistant', content: response.content });
  }

  if (!last) throw new Error('No response from the Anthropic API.');
  return { message: last, usage };
}

/** All text blocks joined; thinking and tool-result blocks are skipped. */
export function messageText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Pulls a JSON object out of a model response. The prompt asks for bare JSON,
 * but a stray code fence or a sentence of preamble should not cost a retry.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('The model did not return a JSON object.');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}
