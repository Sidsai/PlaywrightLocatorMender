import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { buildCorpus, casesPerSource } from '../src/corpus/build.js';
import { loadCorpusEntry, listCorpusEntries } from '../src/corpus/load.js';
import { generateCases } from '../src/mutate/engine.js';

const outDir = 'packages/bench/test/tmp-real-corpus';

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('buildCorpus (real Chromium, real fixture pages)', () => {
  it('captures all six DOM-idiom source pages with verifiable checksums', async () => {
    const manifest = await buildCorpus(outDir);
    expect(manifest.entries).toHaveLength(6);
    for (const entry of manifest.entries) {
      const snapshot = loadCorpusEntry(outDir, entry.id); // throws on sha256 mismatch
      expect(Array.isArray(snapshot)).toBe(true);
    }
  }, 60_000);

  it('spans at least five distinct DOM idioms (PRD §9 selection-by-idiom requirement)', async () => {
    const entries = listCorpusEntries(outDir);
    const idioms = new Set(entries.map((e) => e.idiom));
    expect(idioms.size).toBeGreaterThanOrEqual(5);
  });

  it('every entry records a licence — no entry ships without one', async () => {
    const entries = listCorpusEntries(outDir);
    for (const entry of entries) expect(entry.licence).toBeTruthy();
  });

  it('reaches the ~1000 scored-proposal target by generating cases from the frozen snapshots', async () => {
    const entries = listCorpusEntries(outDir);
    const perSource = casesPerSource(entries.length, 1000);
    let total = 0;
    for (const entry of entries) {
      const snapshot = loadCorpusEntry(outDir, entry.id);
      const cases = generateCases(snapshot, 1, perSource);
      total += cases.length;
    }
    expect(total).toBeGreaterThanOrEqual(1000);
  }, 30_000);
});
