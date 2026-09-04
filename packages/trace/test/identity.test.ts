import { describe, it, expect } from 'vitest';
import { resolveIdentity } from '../src/identity.js';

describe('resolveIdentity', () => {
  it('prefers the trace title when present', () => {
    const r = resolveIdentity({ traceTitle: 'DriftTest#savesTheForm' }, 'traces/other-name.zip');
    expect(r.source).toBe('title');
    expect(r.identity?.raw).toBe('DriftTest#savesTheForm');
  });

  it('title wins even when it conflicts with the filename', () => {
    const r = resolveIdentity({ traceTitle: 'DriftTest#realMethod' }, 'traces/DriftTest#wrongMethod.zip');
    expect(r.source).toBe('title');
    expect(r.identity?.raw).toBe('DriftTest#realMethod');
  });

  it('falls back to sidecar JSON when no title is present', () => {
    const r = resolveIdentity(
      { traceTitle: undefined },
      'traces/anything.zip',
      { readSidecar: () => ({ testIdentity: 'DriftTest#fromSidecar' }) },
    );
    expect(r.source).toBe('sidecar');
    expect(r.identity?.raw).toBe('DriftTest#fromSidecar');
  });

  it('falls back to the filename convention when no title or sidecar exist', () => {
    const r = resolveIdentity({ traceTitle: undefined }, 'traces/DriftTest#savesTheForm.zip');
    expect(r.source).toBe('filename');
    expect(r.identity?.raw).toBe('DriftTest#savesTheForm');
  });

  it('returns none rather than throwing when nothing resolves', () => {
    const r = resolveIdentity({ traceTitle: undefined }, 'traces/trace.zip');
    expect(r.source).toBe('none');
    expect(r.identity).toBeUndefined();
  });
});
