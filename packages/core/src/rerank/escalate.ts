export interface EscalationResult {
  escalated: boolean;
  chosenCandidateId: string | null;
  votes?: (string | null)[];
}

/**
 * Ambiguity escalation (TRD §6, D-006): where the margin falls below delta but the
 * reranker still returned a candidate, re-sample the SAME model `voteCount` times
 * at non-zero temperature. Propose only on unanimous agreement; any disagreement
 * declines — inter-run disagreement measures ambiguity directly, which is what an
 * M6 (near-identical duplicate) case actually is.
 *
 * Votes are cast CONCURRENTLY, not serially — TRD §13's performance budget gives
 * escalation "one rerank budget" total, not `voteCount` sequential rerank calls.
 * Serialising them would put an escalated case at 3x-5x one rerank call and could
 * blow the 15s p95 on its own (D-006's own consequences note). This is why
 * `castVote` is called via Promise.all, not a for-loop with awaits inside it.
 */
export async function escalate(
  marginValue: number,
  deltaThreshold: number,
  initialChoice: string | null,
  castVote: () => Promise<string | null>,
  voteCount = 3,
): Promise<EscalationResult> {
  if (marginValue >= deltaThreshold || initialChoice === null) {
    return { escalated: false, chosenCandidateId: initialChoice };
  }

  const votes = await Promise.all(Array.from({ length: voteCount }, () => castVote()));
  const unanimous = votes.every((v) => v === votes[0]) && votes[0] !== null;

  return {
    escalated: true,
    chosenCandidateId: unanimous ? votes[0] : null,
    votes,
  };
}
