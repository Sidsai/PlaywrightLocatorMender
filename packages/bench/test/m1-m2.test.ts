import { describe, it, expect } from 'vitest';
import { mutateM1 } from '../src/mutate/m1.js';
import { mutateM2 } from '../src/mutate/m2.js';

const snapshot = [
  'BODY',
  {},
  ['BUTTON', { id: 'save-btn', class: 'btn-primary', type: 'submit' }, 'Save changes'],
];

describe('mutateM1 — rename data-testid/id', () => {
  it('changes the id and reports a groundTruthId pointing at the renamed element', () => {
    const result = mutateM1(snapshot, 1);
    expect(result.class).toBe('M1');
    expect(result.groundTruthId).not.toBeNull();
    const mutatedAttrs = (result.mutated as unknown[])[2] as unknown[];
    expect((mutatedAttrs[1] as Record<string, string>).id).not.toBe('save-btn');
  });

  it('the old selector no longer matches anything by id', () => {
    const result = mutateM1(snapshot, 1);
    expect(result.brokenSelector).toBe('#save-btn');
    expect(JSON.stringify(result.mutated)).not.toContain('"id":"save-btn"');
  });
});

describe('mutateM2 — swap utility class strings', () => {
  it('changes the class attribute while keeping id stable', () => {
    const result = mutateM2(snapshot, 1);
    expect(result.class).toBe('M2');
    const mutatedButton = (result.mutated as unknown[])[2] as unknown[];
    const attrs = mutatedButton[1] as Record<string, string>;
    expect(attrs.class).not.toBe('btn-primary');
    expect(attrs.id).toBe('save-btn'); // id untouched — only the class token changed
  });
});
