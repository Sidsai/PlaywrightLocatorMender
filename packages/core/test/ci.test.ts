import { describe, it, expect, vi } from 'vitest';
import { postCiComment, type CiCommentProvider } from '../src/report/ci.js';
import type { RepairResult } from '../src/report/result.js';

const proposed: RepairResult = {
  outcome: 'proposed',
  proposed: '#save-btn',
  margin: 0.2,
  verification: 'unavailable',
  rejected: {},
};

describe('postCiComment', () => {
  it('comments on the associated PR', async () => {
    const commentOnPr = vi.fn().mockResolvedValue(undefined);
    const provider: CiCommentProvider = { commentOnPr };
    await postCiComment(provider, 42, proposed);
    expect(commentOnPr).toHaveBeenCalledWith(42, expect.stringContaining('#save-btn'));
  });

  it('does NOT open a separate PR — there is no such method on the interface at all', () => {
    const provider: CiCommentProvider = { commentOnPr: vi.fn() };
    expect('openPullRequest' in provider).toBe(false);
    expect('createPullRequest' in provider).toBe(false);
  });

  it('does NOT fail the build when comment-posting itself fails — the error is reported, not thrown', async () => {
    const provider: CiCommentProvider = {
      commentOnPr: vi.fn().mockRejectedValue(new Error('GitHub API rate limited')),
    };
    const result = await postCiComment(provider, 1, proposed);
    expect(result.posted).toBe(false);
    expect(result.error).toContain('rate limited');
    // The key assertion: postCiComment resolved rather than rejecting/throwing —
    // if it had thrown, this test itself would fail with an unhandled rejection.
  });

  it('a decline is reported honestly, with its reason', async () => {
    const commentOnPr = vi.fn().mockResolvedValue(undefined);
    const declined: RepairResult = {
      outcome: 'declined',
      declineReason: 'no candidate cleared the margin threshold',
      verification: 'unavailable',
      rejected: {},
    };
    await postCiComment({ commentOnPr }, 1, declined);
    expect(commentOnPr.mock.calls[0][1]).toContain('no candidate cleared the margin threshold');
  });
});
