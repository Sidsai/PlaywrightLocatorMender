import { describe, it, expect } from 'vitest';
import { filterCandidates } from '../src/candidates/filter.js';
import type { Candidate } from '../src/candidates/extract.js';

// Defaults to an interactive role so tests targeting a different concern (viewport,
// the 200 cap) aren't accidentally caught by the accessible-name filter too.
function mk(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id,
    fingerprint: id,
    tag: 'BUTTON',
    role: 'button',
    attrs: {},
    ...overrides,
  };
}

describe('filterCandidates', () => {
  it('drops non-interactive containers with no accessible name', () => {
    const candidates = [
      mk('a', { tag: 'DIV', role: 'generic' }), // no name, non-interactive -> dropped
      mk('b', { tag: 'BUTTON', role: 'button', accessibleName: 'Save' }), // kept
    ];
    const result = filterCandidates(candidates);
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('keeps a generic container that does have an accessible name', () => {
    const candidates = [mk('a', { tag: 'DIV', role: 'generic', accessibleName: 'Nav' })];
    expect(filterCandidates(candidates).map((c) => c.id)).toEqual(['a']);
  });

  it('drops elements outside the viewport region when the region is known', () => {
    const candidates = [
      mk('inside', { bounds: { x: 10, y: 10, width: 10, height: 10 } }),
      mk('outside', { bounds: { x: 5000, y: 5000, width: 10, height: 10 } }),
    ];
    const result = filterCandidates(candidates, { region: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.map((c) => c.id)).toEqual(['inside']);
  });

  it('keeps elements with unknown bounds when the region is known (fail open)', () => {
    const candidates = [mk('unknown-bounds')];
    const result = filterCandidates(candidates, { region: { x: 0, y: 0, width: 100, height: 100 } });
    expect(result.map((c) => c.id)).toEqual(['unknown-bounds']);
  });

  it('does not filter by viewport when the region is unknown', () => {
    const candidates = [mk('far', { bounds: { x: 9999, y: 9999, width: 1, height: 1 } })];
    expect(filterCandidates(candidates).map((c) => c.id)).toEqual(['far']);
  });

  it('caps at 200 after deterministic sorting, independent of input order', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      mk(String(i).padStart(3, '0'), { role: 'button', accessibleName: `btn ${i}` }),
    );
    const forward = filterCandidates(many);
    const shuffled = filterCandidates([...many].reverse());
    expect(forward).toHaveLength(200);
    expect(forward.map((c) => c.id)).toEqual(shuffled.map((c) => c.id));
  });
});
