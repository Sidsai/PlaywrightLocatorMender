import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LanguageAdapter, Patch, TestResult } from '../../core/src/patch/adapter.js';
import type { TestIdentity } from '../../trace/src/events.js';

const execFileAsync = promisify(execFile);

/**
 * Replaces the selector only where it appears as a complete quoted string
 * literal ('#save-btn' or "#save-btn") — NOT as a substring inside a longer
 * literal. A plain string-replace would incorrectly touch '#save-btn-extra' when
 * patching '#save-btn', silently corrupting an unrelated selector that merely
 * shares a prefix. Both quote styles are handled since either is valid TS/JS.
 */
function replaceQuotedLiteral(content: string, oldSelector: string, newSelector: string): string {
  const escapedOld = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(['"])${escapedOld}\\1`, 'g');
  return content.replace(pattern, (_match, quote: string) => `${quote}${newSelector}${quote}`);
}

/**
 * Creates a TypeScript adapter scoped to a specific project directory.
 *
 * A factory rather than a fixed singleton, found necessary while testing
 * runSingleTest for real: `npx playwright test` must run from the directory
 * containing that project's playwright.config.ts, not from wherever the calling
 * process happens to be. Running it from the monorepo root (no config there)
 * produced a confusing Playwright internal error about test() being "called
 * here" incorrectly — not a real test failure, a module-resolution failure from
 * running in the wrong directory entirely. See AI/DECISION.md D-027.
 *
 * On Windows, npm-installed CLI shims are .cmd files, which additionally require
 * `shell: true` to spawn at all via child_process — execFile('npx', ...) without
 * it fails immediately with ENOENT (found in the same investigation).
 */
export function createTypeScriptAdapter(cwd: string = process.cwd()): LanguageAdapter {
  return {
    applyPatch(file: string, oldSelector: string, newSelector: string): Patch {
      const before = readFileSync(file, 'utf8');
      const after = replaceQuotedLiteral(before, oldSelector, newSelector);
      writeFileSync(file, after, 'utf8');
      return { file, before, after };
    },

    async runSingleTest(identity: TestIdentity): Promise<TestResult> {
      const start = Date.now();
      try {
        const { stdout, stderr } = await execFileAsync('npx', ['playwright', 'test', '-g', identity.raw], {
          cwd,
          shell: true,
        });
        return { passed: true, output: stdout + stderr, durationMs: Date.now() - start };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string; message: string };
        return { passed: false, output: (err.stdout ?? '') + (err.stderr ?? err.message), durationMs: Date.now() - start };
      }
    },
  };
}

/** Default instance scoped to process.cwd() — most callers (the CLI) run from
 *  inside the project they're repairing, so this is the common case. */
export const typeScriptAdapter = createTypeScriptAdapter();
