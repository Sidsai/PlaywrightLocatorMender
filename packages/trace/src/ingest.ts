import { openTrace, readText } from './zip.js';
import { getStr, getVal, type FailureRecord, type FailureKind } from './events.js';

interface RawEvent {
  type?: string;
  callId?: string;
  class?: string;
  method?: string;
  apiName?: string;
  params?: Record<string, unknown>;
  error?: { message?: string };
  afterSnapshot?: string;
  beforeSnapshot?: string;
  startTime?: number;
  [k: string]: unknown;
}

/**
 * Maps a Playwright error message to a FailureKind, or undefined if it's neither
 * kind Mender handles (assertion/navigation/frame failures are out of scope per
 * PRD §4 and are discarded by the caller).
 *
 * Confirmed against real fixture traces (D-014/D-015/D-016):
 *   timeout:          "Timeout 3000ms exceeded." / "TimeoutError: Timeout ..."
 *   strict_violation: "...strict mode violation: locator(...) resolved to N elements"
 */
function classifyError(message: string | undefined): FailureKind | undefined {
  if (!message) return undefined;
  if (/strict mode violation/i.test(message)) return 'strict_violation';
  if (/timeout.*exceeded/i.test(message)) return 'timeout';
  return undefined;
}

function parseTraceFile(entries: Map<string, Uint8Array>, name: string): RawEvent[] {
  const out: RawEvent[] = [];
  for (const line of (readText(entries, name) ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed line — never throw
    }
  }
  return out;
}

/**
 * Reads events from the archive's .trace (JSONL) entries. @playwright/test can write
 * more than one .trace file per run — observed: "test.trace" (a lightweight
 * metadata-only stream with no frame-snapshot events, useless for candidate
 * extraction per TRD §4) alongside "0-trace.trace" (the full context/browser trace
 * with real DOM snapshots). Python and Java each write exactly one "trace.trace".
 *
 * To handle this uniformly across bindings without hardcoding filenames: read every
 * .trace file, and if more than one exists, keep only the ones that actually contain
 * a frame-snapshot event (i.e. carry the DOM data Mender needs). Falls back to every
 * .trace file if none of them have snapshots, rather than returning nothing.
 */
function readAllEvents(entries: Map<string, Uint8Array>): RawEvent[] {
  const traceFiles = [...entries.keys()].filter((n) => n.endsWith('.trace'));
  const parsed = traceFiles.map((f) => parseTraceFile(entries, f));

  const withSnapshots = parsed.filter((events) => events.some((e) => e.type === 'frame-snapshot'));
  const chosen = withSnapshots.length > 0 ? withSnapshots : parsed;

  return chosen.flat();
}

/**
 * Ingests a trace.zip and extracts one FailureRecord per failed action whose kind is
 * "timeout" or "strict_violation" (TRD §3). Every other event is discarded — per
 * PRD §4, assertion/navigation/frame failures are out of scope. Fails with a clear
 * "unsupported trace" message rather than a raw stack trace when the archive can't
 * be opened or parsed at all (TRD §2).
 */
export async function ingest(path: string): Promise<FailureRecord[]> {
  let entries: Map<string, Uint8Array>;
  try {
    entries = openTrace(path);
  } catch (e) {
    throw new Error(`unsupported trace: ${path} (${(e as Error).message})`);
  }

  const events = readAllEvents(entries);
  if (events.length === 0) {
    throw new Error(`unsupported trace: ${path} (no parseable trace events found)`);
  }

  const contextOptions = events.find((e) => e.type === 'context-options');
  const playwrightVersion = getStr(contextOptions, 'playwrightVersion');
  const sdkLanguage = getStr(contextOptions, 'sdkLanguage');
  const traceTitle = getStr(contextOptions, 'title');

  // Playwright compresses repeated same-frame DOM snapshots: only the FIRST
  // frame-snapshot for a given frameId carries a full [tag, attrs, ...children]
  // tree; every later one for that frame is a compact diff reference (observed
  // shape: [[refId, generation]], e.g. "[[2,36]]" — undocumented, never decoded
  // here). This is a real, load-bearing finding, not a fixture artifact — it would
  // silently starve candidate extraction on every multi-action test, since the
  // "after" snapshot of a later action is compact far more often than not.
  //
  // Fix: index only FULL snapshots, keyed by name AND by pageId-in-event-order (the
  // correlation key `before`/`after` events actually carry — they have no frameId
  // of their own), so a compact snapshot can fall back to the nearest preceding full
  // snapshot for the same page. Since the failure snapshot only needs to reflect
  // page state (not the exact never-completed action), the preceding full snapshot
  // is DOM-equivalent whenever nothing changed the DOM between them — true for both
  // failure kinds Mender handles (a timeout means the action never took effect; a
  // strict-mode violation means it never resolved to one element to act on).
  function isFullSnapshotTree(html: unknown): boolean {
    return Array.isArray(html) && typeof html[0] === 'string';
  }

  const snapshotsByName = new Map<string, unknown>();
  const fullSnapshotsByPage: Array<{ pageId: string; html: unknown }> = [];
  for (const e of events) {
    if (e.type !== 'frame-snapshot') continue;
    const name = getStr(e, 'snapshot', 'snapshotName');
    const pageId = getStr(e, 'snapshot', 'pageId');
    // getVal(e, 'snapshot') is the wrapper object ({callId, snapshotName, html,
    // pageId, ...}); the tree extractCandidates() needs is the nested .html.
    const html = getVal(e, 'snapshot', 'html');
    if (name && isFullSnapshotTree(html)) snapshotsByName.set(name, html);
    if (pageId && isFullSnapshotTree(html)) fullSnapshotsByPage.push({ pageId, html });
  }

  /** Resolves a named snapshot to a full tree, falling back to the most recent full
   *  snapshot recorded for the same page when the named one is compact/unknown. */
  function resolveSnapshotHtml(name: string | undefined, pageId: string | undefined): unknown {
    if (name && snapshotsByName.has(name)) return snapshotsByName.get(name);
    if (pageId) {
      for (let i = fullSnapshotsByPage.length - 1; i >= 0; i--) {
        if (fullSnapshotsByPage[i].pageId === pageId) return fullSnapshotsByPage[i].html;
      }
    }
    return fullSnapshotsByPage.at(-1)?.html; // last resort: most recent full snapshot at all
  }

  const records: FailureRecord[] = [];
  const seenCallIds = new Set<string>();
  for (const e of events) {
    if (e.type !== 'after' || !e.error?.message) continue;
    // @playwright/test can write more than one .trace file for a single test run
    // (observed: "test.trace" + "0-trace.trace" both carrying the same failed
    // action). Dedupe by callId so one real failure yields one FailureRecord.
    if (e.callId) {
      if (seenCallIds.has(e.callId)) continue;
      seenCallIds.add(e.callId);
    }
    const kind = classifyError(e.error.message);
    if (!kind) continue; // out of scope per PRD §4 — discard

    // Find the matching `before` event (same callId) for selector/action-intent.
    const before = events.find((b) => b.type === 'before' && b.callId === e.callId);
    const selector = getStr(before, 'params', 'selector');
    if (!selector) continue; // no selector to repair — nothing Mender can act on

    const snapshotName = getStr(e, 'afterSnapshot') ?? getStr(before, 'beforeSnapshot');
    const pageId = getStr(before, 'pageId') ?? getStr(e, 'pageId');
    const html = resolveSnapshotHtml(snapshotName, pageId);

    records.push({
      traceId: path,
      traceTitle,
      sdkLanguage,
      playwrightVersion,
      failureKind: kind,
      brokenSelector: selector,
      actionIntent: `${getStr(before, 'class')}.${getStr(before, 'method')}`,
      url: getStr(before, 'params', 'url') ?? '',
      snapshot: { html },
    });
  }

  return records;
}
