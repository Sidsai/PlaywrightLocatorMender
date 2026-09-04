import { describe, it, expect } from 'vitest';
import { runRepair } from '../src/repair.js';

describe('runRepair (report-only)', () => {
  it('exits 0, reports the broken selector, and proposes the correct fix (M3 heuristic scorer live)', async () => {
    const { exitCode, output } = await runRepair({ trace: ['fixtures/traces/ts-1.62.1-timeout.zip'] });
    expect(exitCode).toBe(0);
    expect(output).toContain('#save-btn-RENAMED');
    // Regression guard: candidate extraction must actually find the real page
    // elements, not silently return 0 (see AI/DECISION.md D-020 — Playwright's
    // compact/diff snapshot encoding once made this read 0 candidates extracted).
    expect(output).not.toContain('0 candidates extracted');
    // The heuristic scorer (Task 33-39) now runs for real: for this fixture, it
    // correctly proposes the actual pre-drift selector.
    expect(output).toContain('proposed  #save-btn');
    expect(output).not.toContain('proposed  #save-btn-RENAMED'); // must not propose the broken one back
  });

  it('supports --json output', async () => {
    const { exitCode, output } = await runRepair({
      trace: ['fixtures/traces/ts-1.62.1-timeout.zip'],
      json: true,
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].brokenSelector).toBe('#save-btn-RENAMED');
  });

  it('defaults to dry-run (no file writes) and still exits 0', async () => {
    const { exitCode } = await runRepair({ trace: ['fixtures/traces/ts-1.62.1-strict.zip'] });
    expect(exitCode).toBe(0);
  });

  it('expands a glob pattern to multiple traces', async () => {
    const { output } = await runRepair({ trace: ['fixtures/traces/ts-1.62.1-*.zip'] });
    expect(output).toContain('#save-btn-RENAMED');
    expect(output).toContain('button.row-action');
  });
});
