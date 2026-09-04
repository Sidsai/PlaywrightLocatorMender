import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadCorpusEntry } from '../src/corpus/load.js';

const dir = 'packages/bench/test/tmp-corpus';

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  const snapshot = ['DIV', {}, 'hello'];
  writeFileSync(`${dir}/entry.json`, JSON.stringify(snapshot));
  const sha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  writeFileSync(
    `${dir}/manifest.json`,
    JSON.stringify({
      entries: [
        {
          id: 'entry',
          app: 'test-app',
          url: 'file:///test',
          licence: 'MIT',
          idiom: 'semantic',
          capturedAt: '2026-01-01',
          sha256,
        },
      ],
    }),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadCorpusEntry', () => {
  it('loads an entry whose sha256 matches the manifest', () => {
    const snapshot = loadCorpusEntry(dir, 'entry');
    expect(snapshot).toEqual(['DIV', {}, 'hello']);
  });

  it('throws loudly when the file has been silently edited (sha256 mismatch)', () => {
    writeFileSync(`${dir}/entry.json`, JSON.stringify(['DIV', {}, 'TAMPERED']));
    expect(() => loadCorpusEntry(dir, 'entry')).toThrow(/sha256|checksum|tamper/i);
  });

  it('throws a clear error for an id not in the manifest', () => {
    expect(() => loadCorpusEntry(dir, 'nonexistent')).toThrow(/not found|unknown/i);
  });
});
