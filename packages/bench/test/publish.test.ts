import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { publishHeuristicBaseline } from '../src/score/publish.js';

describe('publishHeuristicBaseline', () => {
  it('writes RESULTS-heuristics.md with all four PRD §8 metrics, overall and per class', async () => {
    const { overall, delta } = await publishHeuristicBaseline('packages/bench/corpus', 21, 60);
    expect(typeof delta).toBe('number');
    expect(overall.totalCases).toBeGreaterThan(0);

    expect(existsSync('packages/bench/RESULTS-heuristics.md')).toBe(true);
    const content = readFileSync('packages/bench/RESULTS-heuristics.md', 'utf8');
    expect(content).toContain('Repair rate');
    expect(content).toContain('False-repair rate (Wilson 95% upper)');
    expect(content).toContain('Abstention accuracy');
    expect(content).toContain('Per mutation class');
  }, 60_000);
});
