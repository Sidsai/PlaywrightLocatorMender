import { describe, it, expect } from 'vitest';
import { scoreCandidates } from '../src/scoring/heuristic.js';
import { margin } from '../src/scoring/margin.js';
import type { Candidate } from '../src/candidates/extract.js';

function mk(overrides: Partial<Candidate>): Candidate {
  return { id: overrides.id ?? 'x', fingerprint: overrides.fingerprint ?? 'HTML[0]>BODY[0]', tag: 'BUTTON', role: 'button', attrs: {}, ...overrides };
}

describe('scoreCandidates', () => {
  it('returns at most 10, sorted descending by score', () => {
    const candidates = Array.from({ length: 15 }, (_, i) =>
      mk({ id: `c${i}`, attrs: { id: `id-${i}` }, accessibleName: `Button ${i}` }),
    );
    const scored = scoreCandidates('#id-3', candidates);
    expect(scored.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < scored.length; i++) expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
  });

  it('scores are within [0, 1]', () => {
    const candidates = [mk({ id: 'a', attrs: { id: 'save-btn' } })];
    const scored = scoreCandidates('#save-btn', candidates);
    for (const s of scored) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('an exact id match scores clearly above an unrelated candidate', () => {
    const exact = mk({ id: 'a', attrs: { id: 'save-btn' }, accessibleName: 'Save' });
    const unrelated = mk({ id: 'b', attrs: { id: 'zzz' }, role: 'textbox', accessibleName: 'Something else' });
    const scored = scoreCandidates('#save-btn', [exact, unrelated]);
    expect(scored[0].candidate.id).toBe('a');
  });
});

describe('margin — the runtime M6 detector', () => {
  // The claim TRD §5 makes is that margin distinguishes an M6-shaped (ambiguous,
  // near-identical twins) case from a clean, unambiguous one — a RELATIVE claim
  // about the scorer's own output. The absolute delta threshold (pre-corpus
  // default 0.15) used to gate real decisions is tuned from real data at Task 39,
  // not asserted as a scorer property here — asserting a fixed absolute number in
  // this test would be pinning a threshold before the data exists to justify it.
  it('an M6-shaped case (near-identical twins) has a lower margin than a clean M1-shaped case', () => {
    const m6Target = mk({ id: 'a', attrs: {}, role: 'button', accessibleName: 'Save changes' });
    const m6Decoy = mk({ id: 'b', attrs: {}, role: 'button', accessibleName: 'Save changes draft' });
    const m6Margin = margin(scoreCandidates('text="Save changes"', [m6Target, m6Decoy]));

    const m1Target = mk({ id: 'a', attrs: { id: 'save-btn' }, role: 'button', accessibleName: 'Save changes' });
    const m1Unrelated = mk({ id: 'b', attrs: { id: 'cancel-btn' }, role: 'button', accessibleName: 'Cancel' });
    const m1Margin = margin(scoreCandidates('#save-btn', [m1Target, m1Unrelated]));

    expect(m6Margin).toBeLessThan(m1Margin);
  });

  it('a single remaining candidate is maximally unambiguous', () => {
    const only = mk({ id: 'a', attrs: { id: 'save-btn' } });
    expect(margin(scoreCandidates('#save-btn', [only]))).toBe(1);
  });
});
