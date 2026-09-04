import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolvePatch } from '../src/patch/resolve.js';

const root = 'packages/core/test/tmp-exclude-project';

beforeAll(() => {
  mkdirSync(`${root}/fixtures/sub`, { recursive: true });
  mkdirSync(`${root}/src`, { recursive: true });
  mkdirSync(`${root}/target`, { recursive: true });
  mkdirSync(`${root}/.venv/lib`, { recursive: true });
  mkdirSync(`${root}/build`, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePatch — search exclusions', () => {
  it('excludes default build-output/dependency dirs: target, .venv, build', () => {
    writeFileSync(`${root}/target/Compiled.class`, `#never-real-source`);
    writeFileSync(`${root}/.venv/lib/site.py`, `x = '#never-real-source'`);
    writeFileSync(`${root}/build/out.js`, `'#never-real-source'`);
    const result = resolvePatch(root, '#never-real-source');
    expect(result.occurrences).toHaveLength(0);
  });

  it('a glob searchExclude pattern (e.g. "fixtures/**") excludes matching files, per TRD §11 config', () => {
    writeFileSync(`${root}/fixtures/sub/data.ts`, `const x = '#fixture-only-selector';`);
    writeFileSync(`${root}/src/real.ts`, `const y = '#fixture-only-selector';`);
    // Without the exclude, both occurrences count (2+, decline-ambiguous).
    const withoutExclude = resolvePatch(root, '#fixture-only-selector');
    expect(withoutExclude.occurrences).toHaveLength(2);
    // With "fixtures/**" excluded, only the real source occurrence remains — a
    // clean single-occurrence patch.
    const withExclude = resolvePatch(root, '#fixture-only-selector', ['fixtures/**']);
    expect(withExclude.action).toBe('patch');
    expect(withExclude.occurrences).toHaveLength(1);
    expect(withExclude.occurrences[0].file).toContain('real.ts');
  });

  it('a bare directory name in extraExcludes still works (Task 53 behavior preserved)', () => {
    mkdirSync(`${root}/custom-exclude-dir`, { recursive: true });
    writeFileSync(`${root}/custom-exclude-dir/x.ts`, `'#dir-name-excluded-selector'`);
    const result = resolvePatch(root, '#dir-name-excluded-selector', ['custom-exclude-dir']);
    expect(result.occurrences).toHaveLength(0);
  });
});
