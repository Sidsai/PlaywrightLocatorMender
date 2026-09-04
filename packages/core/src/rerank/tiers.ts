import type { RerankProvider } from './provider.js';

export interface TierEntry {
  tier: 1 | 2 | 3;
  provider: RerankProvider;
  healthCheck: () => Promise<boolean>;
}

export interface TierResolution {
  tier: 0 | 1 | 2 | 3;
  provider?: RerankProvider;
  reason?: string;
}

async function checkHealthy(entry: TierEntry): Promise<boolean> {
  try {
    return await entry.healthCheck();
  } catch {
    return false;
  }
}

/**
 * Resolves which tier to use, per D-005's free-first ladder: 0 (heuristics only)
 * / 1 (local) / 2 (free-tier hosted) / 3 (paid, opt-in only).
 *
 * The load-bearing invariant, tested explicitly: degradation on failure is always
 * DOWNWARD, never toward a more expensive tier. Tiers 1 and 2 are both free, so
 * they chain as an ordinary fallback sequence — if tier 1 is unreachable, tier 2 is
 * tried next. Tier 3 is different: it is NEVER auto-tried as a rescue after a free
 * tier (1 or 2) was configured but failed, because that would silently spend money
 * as a side effect of a free option merely being down — the exact failure mode
 * TRD §6/D-005 forbids. Tier 3 is only attempted when it is the ONLY tier
 * configured at all (no free tier entries present in `tiers`) — meaning the caller
 * already made the opt-in decision to skip straight to paid, rather than this
 * function inferring that decision from a free tier's outage.
 */
export async function resolveProvider(tiers: TierEntry[]): Promise<TierResolution> {
  const freeTiers = tiers.filter((t) => t.tier === 1 || t.tier === 2);
  const paidTier = tiers.find((t) => t.tier === 3);

  for (const entry of freeTiers) {
    if (await checkHealthy(entry)) return { tier: entry.tier, provider: entry.provider };
  }

  if (freeTiers.length === 0 && paidTier && (await checkHealthy(paidTier))) {
    return { tier: paidTier.tier, provider: paidTier.provider };
  }

  return {
    tier: 0,
    reason:
      tiers.length === 0
        ? 'no reranker tier configured — offline heuristic mode'
        : `no free tier was reachable (tried: ${freeTiers.map((t) => t.tier).join(', ') || 'none'}) — degraded to offline heuristic mode without escalating to a paid tier`,
  };
}
