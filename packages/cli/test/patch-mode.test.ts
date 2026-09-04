import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { runRepair } from '../src/repair.js';

const projectRoot = resolve('packages/cli/test/tmp-patch-fixture');
const sourceFile = `${projectRoot}/page.ts`;

const FIXTURE_CONTENT = `await page.locator('#save-btn-RENAMED').click();\n`;

beforeAll(() => mkdirSync(projectRoot, { recursive: true }));
afterAll(() => rmSync(projectRoot, { recursive: true, force: true }));

describe('runRepair --patch mode', () => {
  it('default (dry-run) mode writes nothing to disk', async () => {
    // Source file containing the BROKEN selector (#save-btn-RENAMED) — mirroring
    // a real page-object file whose reference is stale.
    writeFileSync(sourceFile, FIXTURE_CONTENT);
    await runRepair({ trace: ['fixtures/traces/ts-1.62.1-timeout.zip'], patchRoot: projectRoot });
    expect(readFileSync(sourceFile, 'utf8')).toBe(FIXTURE_CONTENT);
  });

  it('--patch writes the change to the real occurrence and prints a diff', async () => {
    writeFileSync(sourceFile, FIXTURE_CONTENT);
    const { output } = await runRepair({
      trace: ['fixtures/traces/ts-1.62.1-timeout.zip'],
      patch: true,
      patchRoot: projectRoot,
    });

    const patched = readFileSync(sourceFile, 'utf8');
    expect(patched).toContain("'#save-btn'"); // rewritten to the proposed selector
    expect(patched).not.toContain('#save-btn-RENAMED'); // the stale broken selector is gone
    expect(output).toMatch(/diff|patched|\+.*#save-btn/i);
  });

  it('every mode (patch or dry-run) shows runner-up, margin, and verification state', async () => {
    writeFileSync(sourceFile, FIXTURE_CONTENT);
    const { output } = await runRepair({ trace: ['fixtures/traces/ts-1.62.1-timeout.zip'], patchRoot: projectRoot });
    expect(output).toContain('runner-up');
    expect(output).toMatch(/margin/i);
    expect(output).toMatch(/verif/i);
  });
});
