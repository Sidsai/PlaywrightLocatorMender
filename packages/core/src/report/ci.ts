import type { RepairResult } from './result.js';

/**
 * The provider surface --ci mode needs. Deliberately has ONLY a comment
 * capability — no method to open a pull request at all (TRD §10: "--ci... does
 * not open a separate PR, which would create merge-ordering problems"). Same
 * structural-enforcement approach as PrProvider (Task 65): the constraint lives
 * in the type, not in a comment saying "don't call openPullRequest here."
 */
export interface CiCommentProvider {
  commentOnPr(prNumber: number, body: string): Promise<void>;
}

/**
 * Comments on the PR associated with the failing run (TRD §10). Never fails the
 * build — "the build already failed, and a second failure adds nothing" — so
 * this function swallows provider errors rather than propagating them; a
 * comment-posting failure must never become a second, redundant CI failure.
 */
export async function postCiComment(
  provider: CiCommentProvider,
  prNumber: number,
  result: RepairResult,
): Promise<{ posted: boolean; error?: string }> {
  const body =
    result.outcome === 'proposed'
      ? `Mender proposes a repair for a broken selector:\n\n**Proposed:** \`${result.proposed}\`\n${result.margin !== undefined ? `**Margin:** ${result.margin.toFixed(2)}\n` : ''}${result.verification === 'verified' ? '**Verified:** ✓' : '**Verification:** unavailable'}`
      : `Mender could not propose a safe repair: ${result.declineReason ?? 'no reason given'}`;

  try {
    await provider.commentOnPr(prNumber, body);
    return { posted: true };
  } catch (e) {
    // Never re-throw: a comment-posting failure must not fail the build a
    // second time. Reported in the return value for logging, not propagated.
    return { posted: false, error: (e as Error).message };
  }
}
