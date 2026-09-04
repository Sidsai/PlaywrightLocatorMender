import { describe, it, expect } from 'vitest';
import { CONFIG_DEFAULTS } from '../src/config.js';

describe('CONFIG_DEFAULTS', () => {
  it('marginThreshold is derived from the real corpus sweep, not the pre-corpus 0.15 guess', () => {
    expect(CONFIG_DEFAULTS.marginThreshold).toBe(0.06);
  });

  it('both thresholds are in [0, 1]', () => {
    expect(CONFIG_DEFAULTS.marginThreshold).toBeGreaterThanOrEqual(0);
    expect(CONFIG_DEFAULTS.marginThreshold).toBeLessThanOrEqual(1);
    expect(CONFIG_DEFAULTS.confidenceThreshold).toBeGreaterThanOrEqual(0);
    expect(CONFIG_DEFAULTS.confidenceThreshold).toBeLessThanOrEqual(1);
  });
});
