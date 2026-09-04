import { describe, it, expect } from 'vitest';
import { mutateM3 } from '../src/mutate/m3.js';
import { mutateM4 } from '../src/mutate/m4.js';

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn' }, 'Save changes'],
  ['BUTTON', { id: 'cancel-btn' }, 'Cancel'],
];

describe('mutateM3 — wrap target in extra elements', () => {
  it('the target is no longer a direct child of its original parent', () => {
    const result = mutateM3(snapshot, 1);
    expect(result.class).toBe('M3');
    expect(result.groundTruthId).not.toBeNull();
    const form = result.mutated as unknown[];
    // Original direct children were both BUTTONs; after wrapping, at least one
    // slot should now hold a wrapper DIV instead.
    const directChildTags = form.slice(2).map((c) => (Array.isArray(c) ? c[0] : c));
    expect(directChildTags).toContain('DIV');
  });
});

describe('mutateM4 — reorder siblings', () => {
  it('sibling order changes while the set of children stays the same', () => {
    const result = mutateM4(snapshot, 1);
    expect(result.class).toBe('M4');
    expect(result.groundTruthId).not.toBeNull();
    const form = result.mutated as unknown[];
    const ids = form
      .slice(2)
      .filter((c): c is unknown[] => Array.isArray(c))
      .map((c) => (c[1] as Record<string, string>).id);
    expect(ids.sort()).toEqual(['cancel-btn', 'save-btn']);
  });
});
