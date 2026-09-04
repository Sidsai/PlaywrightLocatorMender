import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { isVersionSupported, SUPPORTED_PLAYWRIGHT_RANGE } from '../src/version.js';
import { ingest } from '../src/ingest.js';

describe('isVersionSupported', () => {
  it('accepts every real committed fixture version (1.48.0, 1.62.0, 1.62.1)', () => {
    expect(isVersionSupported('1.48.0')).toBe(true);
    expect(isVersionSupported('1.62.0')).toBe(true);
    expect(isVersionSupported('1.62.1')).toBe(true);
  });

  it('rejects a version below the floor', () => {
    expect(isVersionSupported('1.20.0')).toBe(false);
  });

  it('rejects a version above the ceiling', () => {
    expect(isVersionSupported('2.5.0')).toBe(false);
  });

  it('accepts the exact floor and ceiling boundaries', () => {
    expect(isVersionSupported(SUPPORTED_PLAYWRIGHT_RANGE.min)).toBe(true);
    expect(isVersionSupported(SUPPORTED_PLAYWRIGHT_RANGE.max)).toBe(true);
  });
});

describe('ingest() rejects an out-of-range trace with a clear message, not a stack trace', () => {
  const dir = 'packages/trace/test/tmp-version-fixture';
  const tracePath = `${dir}/old-version-trace.zip`;

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    // A minimal synthetic trace: just enough for ingest() to reach the version
    // check (a context-options event carrying an out-of-range playwrightVersion).
    const contextOptions = JSON.stringify({ type: 'context-options', playwrightVersion: '0.9.0', sdkLanguage: 'javascript' });
    const zip = zipSync({ '0-trace.trace': strToU8(contextOptions + '\n') });
    writeFileSync(tracePath, zip);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('names the supported range in the error, and is not a raw stack trace', async () => {
    await expect(ingest(tracePath)).rejects.toThrow(
      new RegExp(`unsupported trace.*0\\.9\\.0.*${SUPPORTED_PLAYWRIGHT_RANGE.min}.*${SUPPORTED_PLAYWRIGHT_RANGE.max}`),
    );
  });
});
