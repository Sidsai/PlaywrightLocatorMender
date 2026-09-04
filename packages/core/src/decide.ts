export interface DecisionInput {
  calibratedConfidence: number;
  margin: number;
  confidenceThreshold: number;
  marginThreshold: number;
}

export type Decision = 'propose' | 'decline';

/**
 * The two-gate decision (TRD §11, D-004). A proposal requires BOTH calibrated
 * confidence >= tau AND margin >= delta — not either alone. This is the entire
 * point of the two-gate design over a single scalar: high confidence with a
 * collapsed margin is exactly the shape of an M6 false repair (a near-identical
 * duplicate can make the model very confident about a wrong answer), and a single
 * confidence threshold is blind to that. All four quadrants of the truth table are
 * tested explicitly (Task 48) — the high-confidence/low-margin quadrant is the one
 * a single-scalar design would get wrong, and is the reason this function exists
 * as a conjunction rather than a simple confidence check.
 */
export function decide(input: DecisionInput): Decision {
  const confidenceOk = input.calibratedConfidence >= input.confidenceThreshold;
  const marginOk = input.margin >= input.marginThreshold;
  return confidenceOk && marginOk ? 'propose' : 'decline';
}
