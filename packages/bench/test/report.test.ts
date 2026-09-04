import { describe, it, expect } from 'vitest';
import { scoreProposer, type Proposer } from '../src/score/report.js';
import { generateCases } from '../src/mutate/engine.js';
import { extractCandidates } from '../../core/src/candidates/extract.js';

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn', class: 'btn-a' }, 'Save changes'],
  ['BUTTON', { id: 'cancel-btn', class: 'btn-b' }, 'Cancel'],
  ['DIV', {}, ['BUTTON', { id: 'draft-btn', class: 'btn-c' }, 'Save draft']],
  ['INPUT', { id: 'username', class: 'field' }],
  ['INPUT', { id: 'password', class: 'field' }],
];

const alwaysGuess: Proposer = {
  propose(c) {
    // "Guesses" by always proposing the first candidate in the mutated snapshot —
    // plausible-looking, structurally real, but has no actual reasoning behind it.
    const candidates = extractCandidates(c.mutated);
    return candidates[0]?.id ?? null;
  },
};

const alwaysDecline: Proposer = {
  propose: () => null,
};

describe('scoreProposer — the benchmark cannot be gamed', () => {
  const cases = generateCases(snapshot, 7, 300);

  it('an always-guess proposer cannot clear the false-repair-rate bar', () => {
    const report = scoreProposer(alwaysGuess, cases);
    // PRD §8: false-repair rate <= 3% (Wilson upper bound). Guessing on every case,
    // including the ~20% adversarial M6 cases, must not pass this.
    expect(report.falseRepairRateWilsonUpper).toBeGreaterThan(0.03);
  });

  it('an always-decline proposer cannot clear the repair-rate bar', () => {
    const report = scoreProposer(alwaysDecline, cases);
    // PRD §8: repair rate >= 75%. Declining everything scores 0.
    expect(report.repairRate).toBeLessThan(0.75);
  });

  it('an always-decline proposer DOES score well on abstention accuracy alone', () => {
    // This is expected and correct — abstention accuracy in isolation IS gameable
    // by always declining. It's repair rate + false-repair rate together that
    // aren't, which is exactly why PRD §8 reports all three rather than any one.
    const report = scoreProposer(alwaysDecline, cases);
    expect(report.abstentionAccuracy).toBe(1);
  });

  it('reports false-repair rate as the Wilson upper bound, never the point estimate', () => {
    const report = scoreProposer(alwaysGuess, cases);
    const pointEstimate = report.falseRepairs / report.totalCases;
    expect(report.falseRepairRateWilsonUpper).toBeGreaterThan(pointEstimate);
  });
});
