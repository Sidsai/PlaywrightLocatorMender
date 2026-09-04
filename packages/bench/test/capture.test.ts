import { describe, it, expect } from 'vitest';
import { capturePage } from '../src/corpus/capture.js';

describe('capturePage', () => {
  it('captures the same page twice with byte-identical output', async () => {
    const a = await capturePage('fixtures/pages/semantic.html');
    const b = await capturePage('fixtures/pages/semantic.html');
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  }, 30_000);

  it('produces a tree extractCandidates can consume', async () => {
    const snapshot = await capturePage('fixtures/pages/semantic.html');
    expect(Array.isArray(snapshot)).toBe(true);
    expect(typeof snapshot[0]).toBe('string');
    expect(JSON.stringify(snapshot)).toContain('save-btn');
  }, 30_000);
});
