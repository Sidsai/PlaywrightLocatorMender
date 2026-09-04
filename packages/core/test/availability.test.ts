import { describe, it, expect } from 'vitest';
import { checkVerificationAvailable } from '../src/verify/availability.js';
import { renderStdout } from '../src/report/result.js';
import type { RepairResult } from '../src/report/result.js';
import type { LanguageAdapter } from '../src/patch/adapter.js';

const fakeAdapter: LanguageAdapter = {
  applyPatch: () => ({ file: 'x', before: '', after: '' }),
  runSingleTest: async () => ({ passed: true, output: '', durationMs: 0 }),
};

describe('checkVerificationAvailable — D-007/TRD §8', () => {
  it('unavailable when there is no language adapter, even with resolved identity', () => {
    const result = checkVerificationAvailable({ raw: 'x', source: 'title' }, undefined);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('adapter');
  });

  it('unavailable when identity is unresolved (source: "none"), even with an adapter', () => {
    const result = checkVerificationAvailable({ raw: '', source: 'none' }, fakeAdapter);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('identity');
  });

  it('unavailable when identity itself is undefined', () => {
    const result = checkVerificationAvailable(undefined, fakeAdapter);
    expect(result.available).toBe(false);
  });

  it('available when both identity is resolved AND an adapter exists', () => {
    const result = checkVerificationAvailable({ raw: 'DriftTest#savesTheForm', source: 'title' }, fakeAdapter);
    expect(result.available).toBe(true);
  });
});

describe('the unavailable path never reads as a pass, and patching still proceeds', () => {
  it('a proposal with verification: "unavailable" is still a real proposal (patching proceeds per D-007) — never a decline', () => {
    const result: RepairResult = {
      outcome: 'proposed', // NOT declined — patching still happens
      proposed: '#save-btn',
      margin: 0.2,
      verification: 'unavailable',
      rejected: {},
    };
    const rendered = renderStdout(result);
    expect(rendered).toContain('proposed');
    expect(rendered).toContain('unavailable');
    expect(rendered).not.toMatch(/verified\s*✓/);
    expect(rendered).not.toMatch(/\bpassed\b/i);
  });
});
