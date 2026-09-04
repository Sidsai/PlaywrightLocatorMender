import { describe, it, expect } from 'vitest';
import { mutateM8 } from '../src/mutate/m8.js';
import { collectElements } from '../src/mutate/helpers.js';

// class is deliberately not in extractCandidates' stable-attrs list (TRD §5: utility
// class tokens carry little identity signal for the heuristic scorer), so this test
// reads the raw mutated tree directly — it's asserting DOM state, not scorer input.

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn', class: 'action-btn' }, 'Save changes'],
  ['BUTTON', { id: 'cancel-btn' }, 'Cancel'],
];

describe('mutateM8 — make the selector match two elements (strict-mode violation)', () => {
  it('the original selector now resolves to >= 2 elements', () => {
    const result = mutateM8(snapshot, 1);
    expect(result.class).toBe('M8');
    const sharedClass = result.brokenSelector.replace(/^\./, '');
    const elements = collectElements(result.mutated);
    const matching = elements.filter((el) => {
      const attrs = el[1] as Record<string, string>;
      return attrs.class?.split(' ').includes(sharedClass);
    });
    expect(matching.length).toBeGreaterThanOrEqual(2);
  });

  it('carries a groundTruthId for the originally-intended element', () => {
    const result = mutateM8(snapshot, 1);
    expect(result.groundTruthId).not.toBeNull();
  });
});
