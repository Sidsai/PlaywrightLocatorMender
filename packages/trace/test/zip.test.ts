import { describe, it, expect } from 'vitest';
import { openTrace } from '../src/zip.js';

describe('openTrace', () => {
  it('throws a clear error for a file that is not a zip', () => {
    expect(() => openTrace('package.json')).toThrow(/not a readable trace archive/i);
  });
});
