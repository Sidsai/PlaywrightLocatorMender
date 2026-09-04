import { describe, it, expect } from 'vitest';
import { generateCases } from '../src/mutate/engine.js';

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn', class: 'btn-a' }, 'Save changes'],
  ['BUTTON', { id: 'cancel-btn', class: 'btn-b' }, 'Cancel'],
  ['INPUT', { id: 'username', class: 'field' }],
  ['INPUT', { id: 'password', class: 'field' }],
];

describe('generateCases', () => {
  it('composition is roughly 15% M7 and 20% M6 over a fixed seed', () => {
    const cases = generateCases(snapshot, 42, 500);
    const m7 = cases.filter((c) => c.class === 'M7').length / cases.length;
    const m6 = cases.filter((c) => c.class === 'M6').length / cases.length;
    expect(m7).toBeGreaterThan(0.13);
    expect(m7).toBeLessThan(0.17);
    expect(m6).toBeGreaterThan(0.18);
    expect(m6).toBeLessThan(0.22);
  });

  it('the same seed reproduces the identical case list', () => {
    const a = generateCases(snapshot, 42, 100);
    const b = generateCases(snapshot, 42, 100);
    expect(a.map((c) => `${c.class}:${c.groundTruthId}:${c.brokenSelector}`)).toEqual(
      b.map((c) => `${c.class}:${c.groundTruthId}:${c.brokenSelector}`),
    );
  });

  it('a different seed can produce a different case list', () => {
    const a = generateCases(snapshot, 1, 100);
    const b = generateCases(snapshot, 2, 100);
    expect(a).not.toEqual(b);
  });
});
