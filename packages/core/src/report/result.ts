/**
 * The one result shape every reporter mode (stdout/patch/PR/CI, TRD §10) and every
 * downstream consumer (verifier, patch resolver) shares. Defined early (M1) so
 * later tasks — the verifier (Task 56), the two-gate decision (Task 48), the
 * `unavailable` path (Task 57) — all agree on field names from the start rather than
 * drifting.
 */
export interface RepairResult {
  outcome: 'proposed' | 'declined';
  proposed?: string;
  runnerUp?: string;
  margin?: number;
  confidence?: number;
  /**
   * "verified": the proposal was applied to a scratch copy and the affected test
   * passed. "unavailable": verification could not be attempted — identity unresolved
   * (TRD §8) or no adapter for the language. NEVER silently treated as a pass —
   * D-007/TRD §8: missing identity blocks verification only, not patching, and the
   * reporter must say so plainly rather than let it read as success.
   */
  verification: 'verified' | 'unavailable';
  declineReason?: string;
  rejected: Record<string, string>;
}

/**
 * Human-readable stdout rendering, per TRD §10 — every mode shows the runner-up,
 * margin, and verification state, and `unavailable` verification is never rendered
 * in a way that could be mistaken for a pass.
 */
export function renderStdout(result: RepairResult): string {
  const lines: string[] = [];

  if (result.outcome === 'declined') {
    lines.push(`declined${result.declineReason ? `: ${result.declineReason}` : ''}`);
  } else {
    lines.push(`proposed  ${result.proposed}`);
    if (result.runnerUp) lines.push(`runner-up ${result.runnerUp}`);
    const conf = result.confidence !== undefined ? result.confidence.toFixed(2) : '?';
    const margin = result.margin !== undefined ? result.margin.toFixed(2) : '?';
    lines.push(`confidence ${conf}   ·   margin ${margin}`);
  }

  lines.push(result.verification === 'verified' ? 'verified ✓' : 'verification unavailable');

  return lines.join('\n');
}
