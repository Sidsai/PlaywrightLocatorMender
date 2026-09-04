// Relative cross-package imports: no build/dist step exists yet (same pattern as
// packages/cli/src/repair.ts) — becomes @mender/core once M7 sets up bundling.
import { scoreCandidates } from '../../../core/src/scoring/heuristic.js';
import { margin } from '../../../core/src/scoring/margin.js';
import { extractCandidates } from '../../../core/src/candidates/extract.js';
import { filterCandidates } from '../../../core/src/candidates/filter.js';
import { wilsonUpper } from './wilson.js';
import type { MutationResult } from '../mutate/types.js';

export interface SweepPoint {
  delta: number;
  repairRate: number;
  falseRepairWilsonUpper: number;
  abstentionAccuracy: number;
  coverage: number; // fraction of ALL cases where a proposal was made (not declined)
}

interface Precomputed {
  margin: number;
  topCandidateId: string | undefined;
  groundTruthId: string | null;
}

/**
 * Runs the heuristic scorer exactly ONCE per case, not once per (case, delta) pair.
 * `scoreCandidates`/`margin` don't depend on delta at all — only the propose/decline
 * DECISION does. The first implementation of this sweep recomputed scores for every
 * one of the 51 delta steps, making a real-corpus sweep take ~540s. Precomputing
 * turns that into one pass over the cases plus 51 cheap threshold comparisons.
 */
function precompute(cases: MutationResult[]): Precomputed[] {
  return cases.map((c) => {
    const candidates = filterCandidates(extractCandidates(c.mutated));
    if (candidates.length === 0) return { margin: 1, topCandidateId: undefined, groundTruthId: c.groundTruthId };
    const scored = scoreCandidates(c.brokenSelector, candidates);
    if (scored.length === 0) return { margin: 1, topCandidateId: undefined, groundTruthId: c.groundTruthId };
    return { margin: margin(scored), topCandidateId: scored[0].candidate.id, groundTruthId: c.groundTruthId };
  });
}

/** Sweeps delta from 0.00 to 0.50 in steps of 0.01 against precomputed
 *  (margin, topCandidateId, groundTruthId) triples — TRD §5's offline-mode gate:
 *  "if the top candidate exceeds a configured margin over the second, it is
 *  proposed; otherwise Mender declines." No confidence gate here — that's the
 *  reranker's addition (M4, Task 48). */
export function sweepDelta(cases: MutationResult[]): SweepPoint[] {
  const pre = precompute(cases);
  const points: SweepPoint[] = [];

  for (let deltaRaw = 0; deltaRaw <= 0.5 + 1e-9; deltaRaw += 0.01) {
    const delta = Math.round(deltaRaw * 100) / 100;
    let repairs = 0;
    let falseRepairs = 0;
    let correctAbstentions = 0;
    let repairableCases = 0;
    let unrepairableCases = 0;
    let proposalsMade = 0;

    for (const p of pre) {
      const proposed = p.margin >= delta && p.topCandidateId ? p.topCandidateId : null;
      if (p.groundTruthId === null) {
        unrepairableCases++;
        if (proposed === null) correctAbstentions++;
      } else {
        repairableCases++;
        if (proposed !== null) {
          proposalsMade++;
          if (proposed === p.groundTruthId) repairs++;
          else falseRepairs++;
        }
      }
    }

    points.push({
      delta,
      repairRate: repairableCases > 0 ? repairs / repairableCases : 0,
      falseRepairWilsonUpper: wilsonUpper(falseRepairs, cases.length),
      abstentionAccuracy: unrepairableCases > 0 ? correctAbstentions / unrepairableCases : 0,
      coverage: cases.length > 0 ? proposalsMade / cases.length : 0,
    });
  }

  return points;
}

/**
 * Selects the largest-coverage operating point whose false-repair rate (Wilson
 * upper bound) still clears the PRD §8 bar — not the largest whose POINT ESTIMATE
 * clears it (D-011). Returns undefined if no delta in the sweep clears the bar,
 * which is itself a real, publishable finding (TRD §14: "heuristics match the
 * model... acceptable — report it") rather than a case to silently paper over.
 */
export function selectOperatingPoint(points: SweepPoint[], maxFalseRepairRate = 0.03): SweepPoint | undefined {
  const clearing = points.filter((p) => p.falseRepairWilsonUpper <= maxFalseRepairRate);
  if (clearing.length === 0) return undefined;
  return clearing.reduce((best, p) => (p.coverage > best.coverage ? p : best));
}
