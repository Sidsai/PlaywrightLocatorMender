import { describe, it, expect } from 'vitest';
import { fitIsotonic, applyCalibration } from '../src/rerank/calibration.js';

describe('fitIsotonic / applyCalibration', () => {
  it('sends a stated 0.9 to approximately 0.7 when 0.9-stated observations are 70% correct', () => {
    const observations = [
      ...Array.from({ length: 7 }, () => ({ statedConfidence: 0.9, correct: true })),
      ...Array.from({ length: 3 }, () => ({ statedConfidence: 0.9, correct: false })),
    ];
    const map = fitIsotonic(observations);
    const calibrated = applyCalibration(map, 0.9);
    expect(calibrated).toBeCloseTo(0.7, 1);
  });

  it('the fitted map is monotone non-decreasing', () => {
    const observations = [
      { statedConfidence: 0.5, correct: false },
      { statedConfidence: 0.6, correct: true }, // a "violation" — higher stated, but this bucket alone looks good
      { statedConfidence: 0.6, correct: false },
      { statedConfidence: 0.7, correct: false }, // another violation relative to 0.6's mean
      { statedConfidence: 0.9, correct: true },
      { statedConfidence: 0.9, correct: true },
      { statedConfidence: 0.95, correct: true },
    ];
    const map = fitIsotonic(observations);
    for (let i = 1; i < map.points.length; i++) {
      expect(map.points[i].calibratedConfidence).toBeGreaterThanOrEqual(map.points[i - 1].calibratedConfidence);
    }
    // Spot-check across the interpolated range too, not just the fitted points.
    let prev = applyCalibration(map, 0);
    for (let x = 0.05; x <= 1; x += 0.05) {
      const cur = applyCalibration(map, x);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });

  it('ships as data — a CalibrationMap round-trips through JSON with no code involved', () => {
    const map = fitIsotonic([
      { statedConfidence: 0.8, correct: true },
      { statedConfidence: 0.5, correct: false },
    ]);
    const roundTripped = JSON.parse(JSON.stringify(map));
    expect(applyCalibration(roundTripped, 0.8)).toBe(applyCalibration(map, 0.8));
  });

  it('passes through unchanged when there is no calibration data yet', () => {
    const map = fitIsotonic([]);
    expect(applyCalibration(map, 0.73)).toBe(0.73);
  });
});
