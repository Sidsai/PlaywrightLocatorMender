import { wilsonUpper } from './wilson.js';
import type { MutationResult } from '../mutate/types.js';

export interface Proposer {
  /** Given a case, returns the candidateId it proposes, or null to decline. */
  propose(mutationCase: MutationResult): string | null;
}

export interface BenchmarkReport {
  totalCases: number;
  repairableCases: number; // every class except M7
  unrepairableCases: number; // M7 only
  repairs: number; // proposed AND matched ground truth
  falseRepairs: number; // proposed AND did NOT match ground truth
  declinesOnRepairable: number; // declined a case that WAS repairable (a miss)
  correctAbstentions: number; // declined an M7 (unrepairable) case
  repairRate: number; // repairs / repairableCases
  falseRepairRateWilsonUpper: number; // Wilson 95% upper bound on falseRepairs / totalCases
  abstentionAccuracy: number; // correctAbstentions / unrepairableCases
}

/**
 * Scores a proposer against a set of mutation cases per the four PRD §8 metrics.
 * False-repair rate is reported as the Wilson upper bound (D-011), never the point
 * estimate — see wilson.ts.
 */
export function scoreProposer(proposer: Proposer, cases: MutationResult[]): BenchmarkReport {
  let repairs = 0;
  let falseRepairs = 0;
  let declinesOnRepairable = 0;
  let correctAbstentions = 0;

  const repairableCases = cases.filter((c) => c.groundTruthId !== null);
  const unrepairableCases = cases.filter((c) => c.groundTruthId === null);

  for (const c of cases) {
    const proposal = proposer.propose(c);
    if (c.groundTruthId === null) {
      // M7: unrepairable. A decline is correct; a proposal here (even one that
      // "looks right") has nothing to match against, so it's simply not a repair.
      if (proposal === null) correctAbstentions++;
    } else {
      if (proposal === null) {
        declinesOnRepairable++;
      } else if (proposal === c.groundTruthId) {
        repairs++;
      } else {
        falseRepairs++;
      }
    }
  }

  return {
    totalCases: cases.length,
    repairableCases: repairableCases.length,
    unrepairableCases: unrepairableCases.length,
    repairs,
    falseRepairs,
    declinesOnRepairable,
    correctAbstentions,
    repairRate: repairableCases.length > 0 ? repairs / repairableCases.length : 0,
    falseRepairRateWilsonUpper: wilsonUpper(falseRepairs, cases.length),
    abstentionAccuracy: unrepairableCases.length > 0 ? correctAbstentions / unrepairableCases.length : 0,
  };
}
