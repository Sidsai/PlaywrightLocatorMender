import { describe, it, expect } from 'vitest';
import { buildCorpus } from '../src/corpus/build.js';
import { listCorpusEntries } from '../src/corpus/load.js';

// Builds the real, committed corpus at packages/bench/corpus/ (created in Task 22's
// directory, populated here). Re-running this test regenerates the frozen snapshots
// — safe, since capturePage() is verified byte-identical across runs (Task 22).
describe('the committed frozen corpus', () => {
  it('builds successfully with all six idioms represented', async () => {
    const manifest = await buildCorpus('packages/bench/corpus');
    expect(manifest.entries).toHaveLength(6);
    const idioms = new Set(manifest.entries.map((e) => e.idiom));
    expect(idioms.size).toBe(6);
  }, 60_000);

  it('every committed entry is loadable and licence-tagged', () => {
    const entries = listCorpusEntries('packages/bench/corpus');
    for (const entry of entries) {
      expect(entry.licence).toBeTruthy();
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
