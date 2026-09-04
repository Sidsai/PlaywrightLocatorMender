import { describe, it, expect, vi } from 'vitest';
import { cacheKey, createMemoryCache } from '../src/rerank/cache.js';
import { buildPrompt } from '../src/rerank/prompt.js';
import type { Candidate } from '../src/candidates/extract.js';

function mk(overrides: Partial<Candidate>): Candidate {
  return { id: 'x', fingerprint: 'x', tag: 'BUTTON', role: 'button', attrs: {}, ...overrides };
}

async function cachedComplete(
  cache: ReturnType<typeof createMemoryCache>,
  prompt: ReturnType<typeof buildPrompt>,
  model: string,
  baseUrl: string,
  fetcher: () => Promise<{ chosenCandidateId: string | null; confidence: number; reasoning: string; rejectedReasons: Record<string, string> }>,
) {
  const key = cacheKey(prompt, model, baseUrl);
  const cached = cache.get(key);
  if (cached) return cached;
  const response = await fetcher();
  cache.set(key, response);
  return response;
}

describe('prompt cache', () => {
  it('an identical rendered prompt hits the cache and issues zero requests', async () => {
    const cache = createMemoryCache();
    const candidates = [mk({ attrs: { id: 'save-btn' } })];
    const prompt = buildPrompt('#x', 'Frame.click', candidates, 'timeout');
    const fetcher = vi.fn().mockResolvedValue({ chosenCandidateId: 'a', confidence: 0.9, reasoning: 'x', rejectedReasons: {} });

    await cachedComplete(cache, prompt, 'llama3', 'http://localhost:11434', fetcher);
    await cachedComplete(cache, prompt, 'llama3', 'http://localhost:11434', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a changed prompt misses the cache', async () => {
    const cache = createMemoryCache();
    const candidatesA = [mk({ attrs: { id: 'save-btn' } })];
    const candidatesB = [mk({ attrs: { id: 'cancel-btn' } })];
    const fetcher = vi.fn().mockResolvedValue({ chosenCandidateId: 'a', confidence: 0.9, reasoning: 'x', rejectedReasons: {} });

    await cachedComplete(cache, buildPrompt('#x', 'Frame.click', candidatesA, 'timeout'), 'llama3', 'http://localhost:11434', fetcher);
    await cachedComplete(cache, buildPrompt('#x', 'Frame.click', candidatesB, 'timeout'), 'llama3', 'http://localhost:11434', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('the cache key includes model AND base URL — switching tiers cannot serve a stale answer', async () => {
    const candidates = [mk({ attrs: { id: 'save-btn' } })];
    const prompt = buildPrompt('#x', 'Frame.click', candidates, 'timeout');

    const keyLocal = cacheKey(prompt, 'llama3', 'http://localhost:11434');
    const keyDifferentModel = cacheKey(prompt, 'mistral', 'http://localhost:11434');
    const keyDifferentUrl = cacheKey(prompt, 'llama3', 'https://api.some-free-tier.example');

    expect(keyLocal).not.toBe(keyDifferentModel);
    expect(keyLocal).not.toBe(keyDifferentUrl);
  });
});
