import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolvePatch } from '../src/patch/resolve.js';

const root = 'packages/core/test/tmp-resolve-project';

beforeAll(() => {
  mkdirSync(`${root}/src`, { recursive: true });
  mkdirSync(`${root}/node_modules/some-dep`, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePatch — literal search with ambiguity guard (TRD §7)', () => {
  it('patches when the selector occurs exactly once', () => {
    writeFileSync(`${root}/src/one.ts`, `await page.locator('#save-btn').click();`);
    const result = resolvePatch(root, '#save-btn');
    expect(result.action).toBe('patch');
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].file).toContain('one.ts');
  });

  it('declines with zero occurrences — likely a dynamically constructed selector', () => {
    const result = resolvePatch(root, '#totally-absent-selector-xyz');
    expect(result.action).toBe('decline');
    expect(result.reason).toMatch(/dynamically constructed/);
    expect(result.occurrences).toHaveLength(0);
  });

  it('declines with 2+ occurrences and reports EVERY location', () => {
    writeFileSync(`${root}/src/dup-a.ts`, `const sel = '#duplicate-selector';`);
    writeFileSync(`${root}/src/dup-b.ts`, `const sel2 = '#duplicate-selector';`);
    const result = resolvePatch(root, '#duplicate-selector');
    expect(result.action).toBe('decline');
    expect(result.occurrences).toHaveLength(2);
    const files = result.occurrences.map((o) => o.file);
    expect(files.some((f) => f.includes('dup-a.ts'))).toBe(true);
    expect(files.some((f) => f.includes('dup-b.ts'))).toBe(true);
  });

  it('handles Page Object Model without modelling it — selector defined in one file, failure originates in another', () => {
    writeFileSync(
      `${root}/src/LoginPage.ts`,
      `export class LoginPage {\n  saveBtn = '#pom-save-btn';\n  clickSave() { this.page.locator(this.saveBtn).click(); }\n}`,
    );
    writeFileSync(
      `${root}/src/LoginTest.ts`,
      `import { LoginPage } from './LoginPage';\ntest('saves', async () => { new LoginPage().clickSave(); });`, // no literal selector here
    );
    // The failing action is in LoginTest.ts, but the broken selector string only
    // literally appears in LoginPage.ts — resolvePatch finds it there without any
    // POM-specific modelling, purely via the literal string search.
    const result = resolvePatch(root, '#pom-save-btn');
    expect(result.action).toBe('patch');
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].file).toContain('LoginPage.ts');
  });

  it('excludes node_modules from the search by default', () => {
    writeFileSync(`${root}/node_modules/some-dep/index.js`, `module.exports = '#never-searched-here';`);
    const result = resolvePatch(root, '#never-searched-here');
    expect(result.action).toBe('decline'); // zero occurrences — node_modules excluded
    expect(result.occurrences).toHaveLength(0);
  });
});
