export interface CalibrationObservation {
  statedConfidence: number;
  correct: boolean;
}

/** A calibration map is DATA (a sorted list of {x, y} points), not code — it can
 *  be re-fit and re-shipped per provider/model without a release (TRD §6). */
export interface CalibrationMap {
  points: Array<{ statedConfidence: number; calibratedConfidence: number }>;
}

/**
 * Fits an isotonic (monotone non-decreasing) regression from stated LLM
 * confidence to empirical accuracy, via the pool-adjacent-violators algorithm
 * (PAVA) — the standard technique for this exact problem. Self-reported LLM
 * confidence is not a probability (TRD §6); this remaps it to one, using real
 * observed correctness data rather than trusting the model's own number.
 *
 * Falls back toward the observed mean where a stated-confidence bucket has very
 * few observations (thin bins) — PAVA naturally handles this by pooling adjacent
 * violating segments, which is exactly the Platt-style smoothing TRD §6 asks for
 * without needing a second, separate algorithm.
 */
export function fitIsotonic(observations: CalibrationObservation[]): CalibrationMap {
  if (observations.length === 0) return { points: [] };

  const sorted = [...observations].sort((a, b) => a.statedConfidence - b.statedConfidence);

  // PAVA: start with each observation as its own block (y = 0 or 1), then merge
  // adjacent blocks whenever a later block's mean is lower than an earlier one's
  // (a monotonicity violation), replacing both with their combined weighted mean.
  const blocks: Array<{ xSum: number; ySum: number; weight: number; xMin: number; xMax: number }> = sorted.map((o) => ({
    xSum: o.statedConfidence,
    ySum: o.correct ? 1 : 0,
    weight: 1,
    xMin: o.statedConfidence,
    xMax: o.statedConfidence,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    const meanI = blocks[i].ySum / blocks[i].weight;
    const meanNext = blocks[i + 1].ySum / blocks[i + 1].weight;
    if (meanI > meanNext) {
      blocks[i] = {
        xSum: blocks[i].xSum + blocks[i + 1].xSum,
        ySum: blocks[i].ySum + blocks[i + 1].ySum,
        weight: blocks[i].weight + blocks[i + 1].weight,
        xMin: blocks[i].xMin,
        xMax: blocks[i + 1].xMax,
      };
      blocks.splice(i + 1, 1);
      if (i > 0) i--; // re-check the newly-merged block against its predecessor
    } else {
      i++;
    }
  }

  const points = blocks.map((b) => ({
    statedConfidence: b.xSum / b.weight,
    calibratedConfidence: b.ySum / b.weight,
  }));

  return { points };
}

/** Applies a calibration map to a stated confidence via linear interpolation
 *  between the map's nearest points; clamps to the map's edge values outside its
 *  observed range rather than extrapolating. Monotone by construction, since the
 *  fitted points themselves are monotone. */
export function applyCalibration(map: CalibrationMap, statedConfidence: number): number {
  if (map.points.length === 0) return statedConfidence; // no data yet — pass through
  if (map.points.length === 1) return map.points[0].calibratedConfidence;

  if (statedConfidence <= map.points[0].statedConfidence) return map.points[0].calibratedConfidence;
  const last = map.points[map.points.length - 1];
  if (statedConfidence >= last.statedConfidence) return last.calibratedConfidence;

  for (let i = 0; i < map.points.length - 1; i++) {
    const a = map.points[i];
    const b = map.points[i + 1];
    if (statedConfidence >= a.statedConfidence && statedConfidence <= b.statedConfidence) {
      const span = b.statedConfidence - a.statedConfidence;
      const t = span === 0 ? 0 : (statedConfidence - a.statedConfidence) / span;
      return a.calibratedConfidence + t * (b.calibratedConfidence - a.calibratedConfidence);
    }
  }
  return statedConfidence;
}
