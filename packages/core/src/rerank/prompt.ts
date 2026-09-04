import { buildPayload, redact, type RerankPayload } from './redact.js';
import type { Candidate } from '../candidates/extract.js';
import type { FailureKind } from '../../../trace/src/events.js';

export interface RerankPrompt {
  systemPrompt: string;
  payload: RerankPayload;
}

const TIMEOUT_SYSTEM_PROMPT = `You are choosing a replacement for a Playwright selector that no longer resolves.
You will be given the broken selector, the action being attempted, and a list of
candidate elements found on the page. Choose the ONE candidate that the broken
selector most likely used to target, or decline if none is a safe match.
Never invent a selector — choose only from the given candidate ids, or return null.`;

const STRICT_VIOLATION_SYSTEM_PROMPT = `A Playwright selector matched MORE THAN ONE element (a strict-mode violation), so
it could not resolve to a single target. You will be given the selector, the
action being attempted, and every element it matched. Your task is different from
the timeout case: choose WHICH of the matched elements was actually intended, and
propose a narrowing qualifier (not a full replacement selector) that would isolate
it. If it is not possible to tell which was intended, decline.`;

/**
 * Builds the reranker prompt (TRD §6). The payload is structured candidate JSON,
 * always redacted before this function returns — never raw HTML, and never
 * unredacted content, regardless of caller. Strict-mode violations get a
 * different system prompt: choosing among already-matched elements and a
 * narrowing qualifier, not finding a replacement from scratch (TRD §6).
 */
export function buildPrompt(
  brokenSelector: string,
  actionIntent: string,
  candidates: Candidate[],
  failureKind: FailureKind,
): RerankPrompt {
  const systemPrompt =
    failureKind === 'strict_violation' ? STRICT_VIOLATION_SYSTEM_PROMPT : TIMEOUT_SYSTEM_PROMPT;

  const payload = redact(buildPayload(candidates));
  // brokenSelector/actionIntent are structural (selector text, action name) not
  // page content, so they travel alongside the payload rather than through
  // redact() — redact() redacts CANDIDATE attribute values specifically.
  return {
    systemPrompt: `${systemPrompt}\n\nBroken selector: ${brokenSelector}\nAction: ${actionIntent}`,
    payload,
  };
}
