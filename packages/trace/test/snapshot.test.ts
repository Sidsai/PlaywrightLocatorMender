import { describe, it, expect } from 'vitest';
import { selectSnapshot } from '../src/snapshot.js';

describe('selectSnapshot', () => {
  it('picks the last snapshot preceding the failed action, closest in time', () => {
    const snapshots = [
      { capturedAt: 10, html: 'a' },
      { capturedAt: 20, html: 'b' },
      { capturedAt: 30, html: 'c' },
    ];
    expect(selectSnapshot(snapshots, 25)?.html).toBe('b');
  });

  it('returns undefined when every snapshot is after the failure', () => {
    const snapshots = [{ capturedAt: 40, html: 'a' }];
    expect(selectSnapshot(snapshots, 25)).toBeUndefined();
  });

  it('returns undefined for an empty list without throwing', () => {
    expect(selectSnapshot([], 25)).toBeUndefined();
  });
});
