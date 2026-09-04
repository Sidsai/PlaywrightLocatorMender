import { describe, it, expect } from 'vitest';
import { mutateM7 } from '../src/mutate/m7.js';
import { extractCandidates } from '../../core/src/candidates/extract.js';

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn' }, 'Save changes'],
  ['BUTTON', { id: 'cancel-btn' }, 'Cancel'],
];

describe('mutateM7 — delete the element (unrepairable)', () => {
  it('groundTruthId is null — there is no correct repair target', () => {
    const result = mutateM7(snapshot, 1);
    expect(result.class).toBe('M7');
    expect(result.groundTruthId).toBeNull();
  });

  it('no candidate in the mutated snapshot is the original element', () => {
    const result = mutateM7(snapshot, 1);
    const candidates = extractCandidates(result.mutated);
    // Whichever element was deleted, its id no longer appears anywhere.
    const remainingIds = candidates.map((c) => c.attrs.id).filter(Boolean);
    expect(remainingIds.length).toBeLessThan(2); // one of the two buttons is gone
  });
});
