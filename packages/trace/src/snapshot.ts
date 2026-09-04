import type { DomSnapshot } from './events.js';

/**
 * Selects the snapshot to use for candidate extraction: the last one captured
 * before the failed action, closest in time where several qualify (TRD §3).
 */
export function selectSnapshot(snapshots: DomSnapshot[], failureTime: number): DomSnapshot | undefined {
  let best: DomSnapshot | undefined;
  for (const s of snapshots) {
    if (s.capturedAt === undefined || s.capturedAt > failureTime) continue;
    if (!best || (best.capturedAt ?? -Infinity) < s.capturedAt) best = s;
  }
  return best;
}
