import { describe, it, expect } from 'vitest';
import { mutateM6 } from '../src/mutate/m6.js';
import { extractCandidates } from '../../core/src/candidates/extract.js';

const snapshot = [
  'FORM',
  {},
  ['BUTTON', { id: 'save-btn' }, 'Save changes'],
  ['DIV', {}, ['BUTTON', { id: 'save-draft-btn' }, 'Save draft']],
];

describe('mutateM6 — duplicate a near-identical element elsewhere (adversarial)', () => {
  it('adds a genuinely near-identical decoy: same role and close accessible name', () => {
    const result = mutateM6(snapshot, 1);
    expect(result.class).toBe('M6');
    expect(result.groundTruthId).not.toBeNull();

    const candidates = extractCandidates(result.mutated);
    const buttons = candidates.filter((c) => c.role === 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(3); // original 2 + 1 decoy

    // The decoy must be a real button with a plausible name — an easy-to-reject
    // decoy (wrong role, empty name) would make the false-repair test meaningless.
    const decoyCandidates = buttons.filter((b) => b.attrs.id !== 'save-btn' && b.attrs.id !== 'save-draft-btn');
    expect(decoyCandidates.length).toBeGreaterThanOrEqual(1);
    expect(decoyCandidates[0].accessibleName).toBeTruthy();
  });

  it('only the true target carries ground truth, never the decoy', () => {
    const result = mutateM6(snapshot, 1);
    const candidates = extractCandidates(result.mutated);
    const groundTruth = candidates.find((c) => c.id === result.groundTruthId);
    // The decoy's id always contains "-decoy-" (see mutateM6) — ground truth must
    // never be the decoy, regardless of which original element the seed picked.
    expect(groundTruth?.attrs.id).not.toContain('-decoy-');
    expect(groundTruth?.attrs.id).toBeTruthy();
  });
});
