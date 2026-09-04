import { createHash } from 'node:crypto';
import type { RerankPrompt } from './prompt.js';
import type { ValidatedRerankResponse } from './schema.js';

/**
 * Cache key includes model AND base URL, not just the rendered prompt — so
 * switching tiers (e.g. local -> free-hosted) can never serve a stale answer from
 * a different model that happened to see an identical prompt. TRD §12's testing
 * requirement names this explicitly.
 */
export function cacheKey(prompt: RerankPrompt, model: string, baseUrl: string): string {
  const material = JSON.stringify({ systemPrompt: prompt.systemPrompt, payload: prompt.payload, model, baseUrl });
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Minimal cache interface — in-memory by default (a Map), swappable for a
 * disk-backed implementation (TRD §11's `.mender-cache` config) without changing
 * callers. Exists so re-scoring a corpus doesn't re-spend free-tier quota
 * repeatedly (TRD §6) and so the benchmark is reproducible without hitting a
 * network provider on every run.
 */
export interface PromptCache {
  get(key: string): ValidatedRerankResponse | undefined;
  set(key: string, response: ValidatedRerankResponse): void;
}

export function createMemoryCache(): PromptCache {
  const store = new Map<string, ValidatedRerankResponse>();
  return {
    get: (key) => store.get(key),
    set: (key, response) => {
      store.set(key, response);
    },
  };
}
