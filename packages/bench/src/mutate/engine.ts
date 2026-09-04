import { mutateM1 } from './m1.js';
import { mutateM2 } from './m2.js';
import { mutateM3 } from './m3.js';
import { mutateM4 } from './m4.js';
import { mutateM5 } from './m5.js';
import { mutateM6 } from './m6.js';
import { mutateM7 } from './m7.js';
import { mutateM8 } from './m8.js';
import { seededRandom } from './helpers.js';
import type { MutationResult } from './types.js';

// Composition target per PRD §9: ~15% M7, ~20% M6, remainder spread across the six
// other (repairable, non-adversarial) classes — chosen so neither an always-guess
// nor an always-decline system can clear the benchmark's bar (Task 31 verifies this
// directly against stub proposers).
const WEIGHTS: Array<{ class: string; weight: number; fn: (s: unknown, seed: number) => MutationResult }> = [
  { class: 'M1', weight: 0.13, fn: mutateM1 },
  { class: 'M2', weight: 0.13, fn: mutateM2 },
  { class: 'M3', weight: 0.13, fn: mutateM3 },
  { class: 'M4', weight: 0.13, fn: mutateM4 },
  { class: 'M5', weight: 0.13, fn: mutateM5 },
  { class: 'M6', weight: 0.2, fn: mutateM6 },
  { class: 'M7', weight: 0.15, fn: mutateM7 },
];
// (M8 intentionally left out of the default weighted mix — it's a distinct failure
// KIND (strict_violation) from the others (timeout), and mixing kinds into one ratio
// would conflate two different things the benchmark measures. M8 is composed
// separately by whatever consumes generateCases, same as the real fixture suites
// treat timeout and strict-violation as separate test cases per TRD §3.)

/**
 * Generates `count` mutation cases from a single seed, deterministically composed
 * per PRD §9's target ratios (~15% M7, ~20% M6, ±2pp). The same seed always
 * reproduces the identical case list — required for benchmark reproducibility
 * across runs and across competing tools (PRD §9's "any tool can be scored").
 */
export function generateCases(snapshot: unknown, seed: number, count: number): MutationResult[] {
  const rand = seededRandom(seed);
  const totalWeight = WEIGHTS.reduce((s, w) => s + w.weight, 0);
  const cases: MutationResult[] = [];

  for (let i = 0; i < count; i++) {
    let r = rand() * totalWeight;
    let chosenIndex = WEIGHTS.length - 1;
    for (let w = 0; w < WEIGHTS.length; w++) {
      if (r < WEIGHTS[w].weight) {
        chosenIndex = w;
        break;
      }
      r -= WEIGHTS[w].weight;
    }

    // Derive a per-case seed from the engine seed + index so each case is
    // reproducible on its own, and distinct cases don't collide on the same
    // internal mutation-function seed.
    const caseSeed = seed * 1_000_003 + i;

    // Not every mutation class applies to every element (e.g. M5 needs a text
    // child). A real page won't have every shape on every element either, so this
    // is expected, not a bug. First retry the SAME chosen class against a few
    // different targets (varying the sub-seed picks a different element via
    // pickTarget's seeded selection) — this is what actually fixes "this specific
    // element doesn't support M5" without disturbing composition. Only after
    // several same-class attempts fail does it fall through to another class,
    // which would otherwise silently inflate whichever class sits next in the
    // array (found via the composition-ratio test: falling through immediately
    // skewed M6 to 27% because M5 kept failing on this fixture's INPUT elements).
    let produced: MutationResult | undefined;
    const SAME_CLASS_RETRIES = 5;
    for (let attempt = 0; attempt < SAME_CLASS_RETRIES && !produced; attempt++) {
      try {
        produced = WEIGHTS[chosenIndex].fn(snapshot, caseSeed + attempt * 7919);
      } catch {
        // this target doesn't support the chosen class — try a different target
      }
    }
    for (let attempt = 0; attempt < WEIGHTS.length && !produced; attempt++) {
      const candidate = WEIGHTS[(chosenIndex + attempt) % WEIGHTS.length];
      try {
        produced = candidate.fn(snapshot, caseSeed);
      } catch {
        // inapplicable to this snapshot/seed combination — try the next class
      }
    }
    if (produced) cases.push(produced);
  }

  return cases;
}
