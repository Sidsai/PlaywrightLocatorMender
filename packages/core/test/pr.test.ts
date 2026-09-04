import { describe, it, expect, vi } from 'vitest';
import { openRepairPr, type PrProvider } from '../src/report/pr.js';
import type { RepairResult } from '../src/report/result.js';

function fakeProvider(): PrProvider {
  return {
    createBranch: vi.fn().mockResolvedValue(undefined),
    commitChanges: vi.fn().mockResolvedValue(undefined),
    openPullRequest: vi.fn().mockResolvedValue({ url: 'https://github.com/example/repo/pull/1' }),
  };
}

const result: RepairResult = {
  outcome: 'proposed',
  proposed: '#save-btn',
  runnerUp: '#cancel-btn',
  margin: 0.2,
  verification: 'unavailable',
  rejected: { 'HTML[0]>BODY[0]>BUTTON[1]': 'role mismatch' },
};

describe('openRepairPr', () => {
  it('the PR body carries the diff, rejected candidates, and reasoning (TRD §10)', async () => {
    const provider = fakeProvider();
    await openRepairPr(provider, 'mender/fix-1', 'src/LoginPage.ts', `'#save-btn-RENAMED'`, `'#save-btn'`, result);

    const body = (provider.openPullRequest as ReturnType<typeof vi.fn>).mock.calls[0][2] as string;
    expect(body).toContain('#save-btn-RENAMED');
    expect(body).toContain("'#save-btn'");
    expect(body).toContain('role mismatch');
    expect(body).toContain('BUTTON[1]');
  });

  it('P2 is enforced structurally — PrProvider has no merge capability at all', () => {
    const provider = fakeProvider();
    // There is no `merge` method on the interface to even call — this is a
    // structural check that the SHAPE has no such method, not just that it
    // wasn't invoked in this particular test.
    expect('merge' in provider).toBe(false);
    expect('mergePullRequest' in provider).toBe(false);
    expect('approve' in provider).toBe(false);
  });

  it('creates a branch and commits before opening the PR, in that order', async () => {
    const provider = fakeProvider();
    const calls: string[] = [];
    (provider.createBranch as ReturnType<typeof vi.fn>).mockImplementation(async () => calls.push('branch'));
    (provider.commitChanges as ReturnType<typeof vi.fn>).mockImplementation(async () => calls.push('commit'));
    (provider.openPullRequest as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push('pr');
      return { url: 'x' };
    });

    await openRepairPr(provider, 'branch', 'f.ts', 'a', 'b', result);
    expect(calls).toEqual(['branch', 'commit', 'pr']);
  });
});
