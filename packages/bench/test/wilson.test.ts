import { describe, it, expect } from 'vitest';
import { wilsonUpper } from '../src/score/wilson.js';

describe('wilsonUpper', () => {
  // These three values are PRD §8's own published corpus-sizing table. If they
  // don't match, the PRD's table is wrong and must be corrected — not this test.
  it('matches the corpus-sizing table in PRD §8', () => {
    expect(wilsonUpper(6, 400)).toBeCloseTo(0.032, 3); // 1.5% -> 3.2%, fails 3%
    expect(wilsonUpper(4, 400)).toBeCloseTo(0.025, 3); // 1.0% -> 2.5%, passes
    expect(wilsonUpper(15, 1000)).toBeCloseTo(0.025, 3); // 1.5% -> 2.5%, passes
  });

  it('returns 0 for zero observed failures out of a positive total', () => {
    expect(wilsonUpper(0, 100)).toBeGreaterThan(0);
    expect(wilsonUpper(0, 100)).toBeLessThan(0.05);
  });

  it('is monotonically non-decreasing in the failure count for a fixed total', () => {
    const a = wilsonUpper(2, 100);
    const b = wilsonUpper(5, 100);
    expect(b).toBeGreaterThan(a);
  });
});
