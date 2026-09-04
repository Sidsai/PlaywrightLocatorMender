import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { verify } from '../src/verify/verify.js';
import type { LanguageAdapter, Patch, TestResult } from '../src/patch/adapter.js';

const dir = 'packages/core/test/tmp-verify-project';
const file = `${dir}/test.ts`;

beforeAll(() => mkdirSync(dir, { recursive: true }));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function realFileAdapter(runSingleTest: LanguageAdapter['runSingleTest']): LanguageAdapter {
  return {
    applyPatch(f: string, oldSel: string, newSel: string): Patch {
      const before = readFileSync(f, 'utf8');
      const after = before.replace(oldSel, newSel);
      writeFileSync(f, after, 'utf8');
      return { file: f, before, after };
    },
    runSingleTest,
  };
}

const identity = { raw: 'x', source: 'title' as const };

describe('verify', () => {
  it('applies the patch, runs the test, and reports verified: true on pass', async () => {
    writeFileSync(file, `'#old'`);
    const adapter = realFileAdapter(async (): Promise<TestResult> => ({ passed: true, output: 'ok', durationMs: 10 }));
    const result = await verify(adapter, file, '#old', '#new', identity, 1000);
    expect(result.verified).toBe(true);
  });

  it('discards a proposal whose test fails, reporting verified: false', async () => {
    writeFileSync(file, `'#old'`);
    const adapter = realFileAdapter(async (): Promise<TestResult> => ({ passed: false, output: 'fail', durationMs: 10 }));
    const result = await verify(adapter, file, '#old', '#new', identity, 1000);
    expect(result.verified).toBe(false);
  });

  it('THE LOAD-BEARING GUARANTEE: restores the original file after a passing verification', async () => {
    writeFileSync(file, `'#old'`);
    const adapter = realFileAdapter(async (): Promise<TestResult> => ({ passed: true, output: '', durationMs: 10 }));
    await verify(adapter, file, '#old', '#new', identity, 1000);
    expect(readFileSync(file, 'utf8')).toBe(`'#old'`); // restored even though it passed
  });

  it('restores the original file after a failing verification', async () => {
    writeFileSync(file, `'#old'`);
    const adapter = realFileAdapter(async (): Promise<TestResult> => ({ passed: false, output: '', durationMs: 10 }));
    await verify(adapter, file, '#old', '#new', identity, 1000);
    expect(readFileSync(file, 'utf8')).toBe(`'#old'`);
  });

  it('restores the original file EVEN WHEN runSingleTest THROWS — the exact failure mode this function exists to prevent', async () => {
    writeFileSync(file, `'#old'`);
    const adapter = realFileAdapter(async () => {
      throw new Error('test runner crashed unexpectedly');
    });
    const result = await verify(adapter, file, '#old', '#new', identity, 1000);
    expect(result.verified).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(`'#old'`); // the throw must not leave the file mutated
  });

  it('times out at 2x the original duration and still restores the file', async () => {
    writeFileSync(file, `'#old'`);
    const adapter = realFileAdapter(
      () => new Promise((resolve) => setTimeout(() => resolve({ passed: true, output: '', durationMs: 500 }), 500)),
    );
    const result = await verify(adapter, file, '#old', '#new', identity, 100); // budget: 200ms, test takes 500ms
    expect(result.verified).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(`'#old'`);
  });
});
