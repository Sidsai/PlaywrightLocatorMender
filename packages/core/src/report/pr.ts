import type { RepairResult } from './result.js';

/**
 * The provider surface --pr mode needs. Deliberately has NO merge capability —
 * not "a merge method that's never called," but no such method exists in the
 * type at all. This is P2 ("a human merges... no configuration option enables
 * unattended merging") enforced structurally: even a future caller with a typo
 * or a misunderstanding of the design cannot accidentally wire up an auto-merge,
 * because there is nothing to wire it to.
 */
export interface PrProvider {
  createBranch(name: string): Promise<void>;
  commitChanges(branch: string, files: Array<{ path: string; content: string }>, message: string): Promise<void>;
  openPullRequest(branch: string, title: string, body: string): Promise<{ url: string }>;
}

/**
 * Builds the PR body per TRD §10: the diff, the rejected candidates and the
 * reasoning. Opens the PR; never merges it (P2) — there is no code path here
 * that could, since PrProvider has no merge method to call.
 */
export async function openRepairPr(
  provider: PrProvider,
  branchName: string,
  file: string,
  before: string,
  after: string,
  result: RepairResult,
): Promise<{ url: string }> {
  await provider.createBranch(branchName);
  await provider.commitChanges(branchName, [{ path: file, content: after }], `fix: repair broken selector in ${file}`);

  const bodyLines = [
    `## Proposed selector repair`,
    ``,
    `**Proposed:** \`${result.proposed}\``,
    result.runnerUp ? `**Runner-up:** \`${result.runnerUp}\`` : '',
    result.margin !== undefined ? `**Margin:** ${result.margin.toFixed(2)}` : '',
    result.verification === 'verified' ? `**Verified:** ✓ (test passes with the proposed selector)` : `**Verification:** unavailable`,
    ``,
    `### Diff`,
    '```diff',
    `--- ${file}`,
    `+++ ${file}`,
    `- ${before.trim()}`,
    `+ ${after.trim()}`,
    '```',
  ];

  if (Object.keys(result.rejected).length > 0) {
    bodyLines.push('', '### Rejected candidates', '');
    for (const [candidateId, reason] of Object.entries(result.rejected)) {
      bodyLines.push(`- \`${candidateId}\`: ${reason}`);
    }
  }

  bodyLines.push('', '_A human reviews and merges this PR — Mender never merges automatically._');

  return provider.openPullRequest(branchName, `fix: repair broken selector`, bodyLines.filter((l) => l !== '').join('\n'));
}
