import { describe, it, expect } from 'vitest';
import { decide } from '../src/decide.js';

const thresholds = { confidenceThreshold: 0.85, marginThreshold: 0.15 };

describe('decide — the two-gate decision (D-004), all four truth-table quadrants', () => {
  it('high confidence + high margin -> propose', () => {
    expect(decide({ calibratedConfidence: 0.9, margin: 0.3, ...thresholds })).toBe('propose');
  });

  it('high confidence + LOW margin -> decline — the M6 defense, the quadrant a single scalar gets wrong', () => {
    // A near-identical duplicate can make the model very confident about a wrong
    // answer; margin is the only signal that catches this. A single-threshold
    // design keyed on confidence alone would incorrectly propose here.
    expect(decide({ calibratedConfidence: 0.95, margin: 0.05, ...thresholds })).toBe('decline');
  });

  it('LOW confidence + high margin -> decline', () => {
    expect(decide({ calibratedConfidence: 0.5, margin: 0.4, ...thresholds })).toBe('decline');
  });

  it('low confidence + low margin -> decline', () => {
    expect(decide({ calibratedConfidence: 0.3, margin: 0.05, ...thresholds })).toBe('decline');
  });

  it('exactly at both thresholds -> propose (>=, not >)', () => {
    expect(decide({ calibratedConfidence: 0.85, margin: 0.15, ...thresholds })).toBe('propose');
  });
});
