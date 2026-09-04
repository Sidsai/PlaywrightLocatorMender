import { describe, it, expect, vi } from 'vitest';
import { resolveProvider, type TierEntry } from '../src/rerank/tiers.js';
import type { RerankProvider } from '../src/rerank/provider.js';

function fakeProvider(name: string): RerankProvider {
  return {
    name,
    complete: vi.fn().mockResolvedValue({ chosenCandidateId: null, confidence: 0, reasoning: '', rejectedReasons: {} }),
  };
}

describe('resolveProvider — the tier ladder (D-005)', () => {
  it('picks tier 1 (local) when it is reachable', async () => {
    const local = fakeProvider('local');
    const tiers: TierEntry[] = [
      { tier: 1, provider: local, healthCheck: vi.fn().mockResolvedValue(true) },
    ];
    const result = await resolveProvider(tiers);
    expect(result.tier).toBe(1);
    expect(result.provider).toBe(local);
  });

  it('degrades to tier 0 (heuristics) when tier 1 is unreachable — CRITICAL: with a paid key present in the environment, it does NOT escalate to tier 3', async () => {
    const paidComplete = vi.fn();
    const tier1Health = vi.fn().mockResolvedValue(false); // local server unreachable
    const tiers: TierEntry[] = [
      { tier: 1, provider: fakeProvider('local'), healthCheck: tier1Health },
      // Tier 3 IS configured (simulating a paid key present in the environment) —
      // but resolution must still land on 0, never silently spend money because
      // the free option failed. This is the exact scenario TRD §6/D-005 requires.
      { tier: 3, provider: { name: 'paid', complete: paidComplete }, healthCheck: vi.fn().mockResolvedValue(true) },
    ];
    const result = await resolveProvider(tiers);
    expect(result.tier).toBe(0);
    expect(result.provider).toBeUndefined();
    expect(result.reason).toBeTruthy();
    // No request was ever issued to the paid endpoint.
    expect(paidComplete).not.toHaveBeenCalled();
  });

  it('tries tiers in the order given, never skipping ahead to a cheaper-looking later tier that was not asked for', async () => {
    const tier1 = fakeProvider('local');
    const tier2 = fakeProvider('free-hosted');
    const tiers: TierEntry[] = [
      { tier: 1, provider: tier1, healthCheck: vi.fn().mockResolvedValue(false) },
      { tier: 2, provider: tier2, healthCheck: vi.fn().mockResolvedValue(true) },
    ];
    const result = await resolveProvider(tiers);
    expect(result.tier).toBe(2);
    expect(result.provider).toBe(tier2);
  });

  it('returns tier 0 with no tiers configured at all (offline mode is always valid)', async () => {
    const result = await resolveProvider([]);
    expect(result.tier).toBe(0);
  });

  it('DOES use tier 3 when it is the only tier configured — the caller already opted in explicitly', async () => {
    const paid = fakeProvider('paid');
    const result = await resolveProvider([{ tier: 3, provider: paid, healthCheck: vi.fn().mockResolvedValue(true) }]);
    expect(result.tier).toBe(3);
    expect(result.provider).toBe(paid);
  });
});
