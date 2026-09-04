import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { typeScriptAdapter, createTypeScriptAdapter } from '../src/index.js';

const dir = 'packages/adapter-typescript/test/tmp-project';
const file = `${dir}/test.spec.ts`;

beforeAll(() => mkdirSync(dir, { recursive: true }));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('typeScriptAdapter.applyPatch', () => {
  it('patches only the exact quoted selector, not a superstring containing it', () => {
    writeFileSync(
      file,
      `await page.locator('#save-btn').click();\nawait page.locator('#save-btn-extra').click();`,
    );
    const patch = typeScriptAdapter.applyPatch(file, '#save-btn', '#save-btn-fixed');
    const content = readFileSync(file, 'utf8');

    expect(content).toContain("locator('#save-btn-fixed')");
    expect(content).toContain("locator('#save-btn-extra')"); // untouched superstring
    expect(patch.before).not.toBe(patch.after);
  });

  it('handles both single and double quote styles', () => {
    writeFileSync(file, `page.locator("#a-btn").click();`);
    typeScriptAdapter.applyPatch(file, '#a-btn', '#a-btn-2');
    expect(readFileSync(file, 'utf8')).toContain('"#a-btn-2"');
  });

  it('records before/after full file content, needed later for reverting (Task 56)', () => {
    writeFileSync(file, `page.locator('#x').click();`);
    const patch = typeScriptAdapter.applyPatch(file, '#x', '#y');
    expect(patch.before).toContain("'#x'");
    expect(patch.after).toContain("'#y'");
  });
});

describe('typeScriptAdapter.runSingleTest', () => {
  // Scoped to the real committed fixtures/ts-suite project, which has its own
  // playwright.config.ts. Running from the monorepo root (no config there)
  // produced a confusing Playwright module-resolution error, not a real
  // pass/fail signal — found while writing this test for real. See D-027.
  const fixtureAdapter = createTypeScriptAdapter(resolve('fixtures/ts-suite'));

  it('shells out to npx playwright test -g "<title>" for real — a nonexistent title reports "no tests found", not a spawn/config error', async () => {
    // A spawn failure (ENOENT from an unresolved command on Windows) and a
    // genuine "no test matched this title" outcome both produce passed: false,
    // so asserting only `passed === false` alone would not distinguish them —
    // exactly how D-027's bug slipped past the first version of this test.
    // Asserting on real Playwright output content is what actually proves the
    // subprocess ran correctly, in the right directory, against the right config.
    const result = await fixtureAdapter.runSingleTest({ raw: 'this test title does not exist anywhere', source: 'title' });
    expect(result.passed).toBe(false);
    expect(typeof result.durationMs).toBe('number');
    expect(result.output).not.toContain('ENOENT');
    expect(result.output).not.toContain('did not expect test() to be called here'); // the config-resolution failure this fix corrects
    expect(result.output.toLowerCase()).toMatch(/no tests found|0 passed|did not match/);
  }, 30_000);

  it('the default export (typeScriptAdapter, scoped to process.cwd()) still works for the common case', () => {
    expect(typeof typeScriptAdapter.runSingleTest).toBe('function');
    expect(typeof typeScriptAdapter.applyPatch).toBe('function');
  });
});
