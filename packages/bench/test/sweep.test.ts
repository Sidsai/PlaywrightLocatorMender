import { describe, it, expect } from 'vitest';
import { sweepDelta, selectOperatingPoint } from '../src/score/sweep.js';
import { generateCases } from '../src/mutate/engine.js';
import { loadCorpusEntry, listCorpusEntries } from '../src/corpus/load.js';

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn', class: 'btn-a' }, 'Save changes'],
  ['BUTTON', { id: 'cancel-btn', class: 'btn-b' }, 'Cancel'],
  ['DIV', {}, ['BUTTON', { id: 'draft-btn', class: 'btn-c' }, 'Save draft']],
  ['INPUT', { id: 'username', class: 'field' }],
  ['INPUT', { id: 'password', class: 'field' }],
];

describe('sweepDelta', () => {
  it('returns 51 points spanning delta 0.00 to 0.50', () => {
    const cases = generateCases(snapshot, 5, 50);
    const points = sweepDelta(cases);
    expect(points).toHaveLength(51);
    expect(points[0].delta).toBe(0);
    expect(points.at(-1)?.delta).toBe(0.5);
  });

  it('coverage is non-increasing as delta rises (a stricter gate declines more, never less)', () => {
    const cases = generateCases(snapshot, 5, 100);
    const points = sweepDelta(cases);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].coverage).toBeLessThanOrEqual(points[i - 1].coverage + 1e-9);
    }
  });
});

describe('selectOperatingPoint', () => {
  it('picks the largest-coverage point whose Wilson upper bound clears the bar', () => {
    const points = [
      { delta: 0.1, repairRate: 0.9, falseRepairWilsonUpper: 0.05, abstentionAccuracy: 1, coverage: 0.9 }, // fails bar
      { delta: 0.2, repairRate: 0.8, falseRepairWilsonUpper: 0.02, abstentionAccuracy: 1, coverage: 0.7 }, // clears, lower coverage
      { delta: 0.3, repairRate: 0.7, falseRepairWilsonUpper: 0.01, abstentionAccuracy: 1, coverage: 0.5 }, // clears, lowest coverage
    ];
    expect(selectOperatingPoint(points)?.delta).toBe(0.2);
  });

  it('returns undefined when no delta clears the bar — a real finding, not silently papered over', () => {
    const points = [{ delta: 0.1, repairRate: 0.9, falseRepairWilsonUpper: 0.5, abstentionAccuracy: 1, coverage: 0.9 }];
    expect(selectOperatingPoint(points)).toBeUndefined();
  });
});

describe('sweepDelta against the real committed corpus', () => {
  it('runs end-to-end and reports the achieved operating point (or the honest absence of one)', async () => {
    const entries = listCorpusEntries('packages/bench/corpus');
    const allCases = entries.flatMap((e) => generateCases(loadCorpusEntry('packages/bench/corpus', e.id), 11, 100));
    const points = sweepDelta(allCases);
    const operatingPoint = selectOperatingPoint(points);
    // No assertion on the outcome itself — TRD §14 explicitly wants this reported
    // either way, not asserted to succeed. Just confirm the pipeline runs clean
    // against real corpus data without throwing.
    expect(points).toHaveLength(51);
    console.log(
      operatingPoint
        ? `Operating point: delta=${operatingPoint.delta}, coverage=${(operatingPoint.coverage * 100).toFixed(1)}%, repairRate=${(operatingPoint.repairRate * 100).toFixed(1)}%, FRR(upper)=${(operatingPoint.falseRepairWilsonUpper * 100).toFixed(2)}%`
        : 'No delta in [0, 0.5] clears the 3% false-repair-rate bar with this heuristic scorer.',
    );
  }, 30_000);
});
