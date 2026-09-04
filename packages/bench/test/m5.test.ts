import { describe, it, expect } from 'vitest';
import { mutateM5 } from '../src/mutate/m5.js';

const snapshot = ['BODY', {}, ['BUTTON', { id: 'save-btn' }, 'Save changes']];

describe('mutateM5 — alter visible text slightly', () => {
  it('changes the text while staying recognisably similar (bounded edit distance)', () => {
    const result = mutateM5(snapshot, 1);
    expect(result.class).toBe('M5');
    expect(result.groundTruthId).not.toBeNull();
    const button = (result.mutated as unknown[])[2] as unknown[];
    const newText = button[2] as string;
    expect(newText).not.toBe('Save changes');
    // "Recognisably similar" is the mutation's whole premise (PRD §9: M5 is
    // repairable). A change unbounded by edit distance would really be an M7-shaped
    // case (unrepairable) mislabelled as M5.
    expect(editDistance(newText, 'Save changes')).toBeLessThanOrEqual(6);
  });
});

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
