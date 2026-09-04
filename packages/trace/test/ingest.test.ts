import { describe, it, expect } from 'vitest';
import { ingest } from '../src/ingest.js';

describe('ingest', () => {
  it('extracts a timeout failure from the TS fixture trace', async () => {
    const records = await ingest('fixtures/traces/ts-1.62.1-timeout.zip');
    expect(records).toHaveLength(1);
    expect(records[0].failureKind).toBe('timeout');
    expect(records[0].brokenSelector).toBe('#save-btn-RENAMED');
  });

  it('extracts a strict_violation failure from the TS fixture trace', async () => {
    const records = await ingest('fixtures/traces/ts-1.62.1-strict.zip');
    expect(records).toHaveLength(1);
    expect(records[0].failureKind).toBe('strict_violation');
    expect(records[0].brokenSelector).toBe('button.row-action');
  });

  it('extracts a timeout failure from the Python fixture trace', async () => {
    const records = await ingest('fixtures/traces/py-1.62.0-timeout.zip');
    expect(records).toHaveLength(1);
    expect(records[0].failureKind).toBe('timeout');
  });

  it('extracts a timeout failure from the Java fixture trace, with title identity', async () => {
    const records = await ingest('fixtures/traces/java-1.48.0-timeout.zip');
    expect(records).toHaveLength(1);
    expect(records[0].failureKind).toBe('timeout');
    expect(records[0].traceTitle).toBe('DriftTest#savesTheForm');
    expect(records[0].sdkLanguage).toBe('java');
  });

  it('resolves a usable full-tree DOM snapshot, not a compact diff reference', async () => {
    // Playwright compresses repeated same-page snapshots into a compact diff form
    // (e.g. "[[2,36]]") after the first one per page — see D-020. This test pins
    // that ingest() always resolves to a real [tag, attrs, ...children] tree.
    const records = await ingest('fixtures/traces/ts-1.62.1-timeout.zip');
    const html = records[0].snapshot.html;
    expect(Array.isArray(html)).toBe(true);
    expect(typeof (html as unknown[])[0]).toBe('string');
    expect(JSON.stringify(html)).toContain('save-btn');
  });

  it('throws a clear "unsupported trace" message for a non-trace file', async () => {
    await expect(ingest('package.json')).rejects.toThrow(/unsupported trace/i);
  });
});
