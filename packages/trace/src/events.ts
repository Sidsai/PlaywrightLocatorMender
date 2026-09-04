/**
 * Types and defensive accessors for parsed trace events, per TRD §3. Every field is
 * optional at the type level because the trace format carries no compatibility
 * guarantee (TRD §2) — this file must never throw on a malformed or unexpected event.
 *
 * Field names below (params.selector, error.message, context-options.title/
 * sdkLanguage, frame-snapshot.snapshot) are confirmed against real fixture traces
 * from all three bindings — see AI/DECISION.md D-014, D-015, D-016 — not assumed
 * from documentation (D-003).
 */

export type FailureKind = 'timeout' | 'strict_violation';

export interface TestIdentity {
  raw: string; // e.g. "DriftTest#savesTheForm" or a pytest node id
  source: 'title' | 'sidecar' | 'filename' | 'none';
}

export interface DomSnapshot {
  html: unknown; // nested [tag, attrs, ...children] tree, per D-014
  frameUrl?: string;
  snapshotName?: string;
  capturedAt?: number; // monotonic timestamp, for TRD §3's "closest in time" selection
}

export interface FailureRecord {
  traceId: string;
  testIdentity?: TestIdentity;
  traceTitle?: string; // caller-set tracing title, where the format carries one
  failureKind: FailureKind;
  brokenSelector: string;
  actionIntent: string; // action name + step title where present
  url: string;
  snapshot: DomSnapshot;
  screenshotRef?: string;
  playwrightVersion?: string;
  sdkLanguage?: string;
}

/**
 * Reads a nested string field from an arbitrary event object without ever throwing.
 * Returns undefined on a missing key, a null intermediate, or a value that isn't a
 * string at the end of the path.
 */
export function getStr(obj: unknown, ...path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Same as getStr but returns the raw value (any type), still never throwing. */
export function getVal(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
