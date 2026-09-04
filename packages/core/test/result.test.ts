import { describe, it, expect } from 'vitest';
import { renderStdout } from '../src/report/result.js';
import type { RepairResult } from '../src/report/result.js';

describe('RepairResult / renderStdout', () => {
  it('never renders "unavailable" verification as a pass', () => {
    const result: RepairResult = {
      outcome: 'proposed',
      proposed: 'page.getByRole("button", { name: "Save changes" })',
      confidence: 0.9,
      margin: 0.3,
      verification: 'unavailable',
      rejected: {},
    };
    const rendered = renderStdout(result);
    expect(rendered).toContain('unavailable');
    expect(rendered).not.toMatch(/verified\s*✓/);
    expect(rendered).not.toMatch(/\bpassed\b/i);
  });

  it('renders a verified proposal distinctly from an unavailable one', () => {
    const verified: RepairResult = {
      outcome: 'proposed',
      proposed: 'x',
      confidence: 0.9,
      margin: 0.3,
      verification: 'verified',
      rejected: {},
    };
    expect(renderStdout(verified)).toMatch(/verified\s*✓/);
  });

  it('renders a decline with its reason', () => {
    const declined: RepairResult = {
      outcome: 'declined',
      declineReason: 'no candidate cleared both thresholds',
      verification: 'unavailable',
      rejected: {},
    };
    const rendered = renderStdout(declined);
    expect(rendered).toContain('declined');
    expect(rendered).toContain('no candidate cleared both thresholds');
  });
});
