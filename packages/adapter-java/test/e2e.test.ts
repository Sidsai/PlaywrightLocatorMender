import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ingest } from '../../trace/src/ingest.js';
import { resolveIdentity } from '../../trace/src/identity.js';
import { extractCandidates } from '../../core/src/candidates/extract.js';
import { filterCandidates } from '../../core/src/candidates/filter.js';
import { scoreCandidates } from '../../core/src/scoring/heuristic.js';
import { margin } from '../../core/src/scoring/margin.js';
import { CONFIG_DEFAULTS } from '../../core/src/config.js';
import { resolvePatch } from '../../core/src/patch/resolve.js';
import { applyJavaPatch } from '../src/patch.js';
import { runJavaTest } from '../src/run.js';
import { checkVerificationAvailable } from '../../core/src/verify/availability.js';
import type { LanguageAdapter } from '../../core/src/patch/adapter.js';

const javaSuiteRoot = resolve('fixtures/java-suite');
const driftTestFile = `${javaSuiteRoot}/src/test/java/DriftTest.java`;

afterEach(() => {
  // Belt-and-suspenders: ensure the real fixture file is never left mutated
  // even if an assertion fails mid-test, regardless of verify()'s own guarantee.
  const current = readFileSync(driftTestFile, 'utf8');
  if (current.includes('#save-btn-RENAMED-')) {
    writeFileSync(driftTestFile, current.replace(/#save-btn-RENAMED-\S*/g, '#save-btn-RENAMED'));
  }
});

describe('End-to-end Java repair (Task 63) — real trace, real Maven, real file', () => {
  it('ingest -> identity -> score -> resolvePatch -> applyJavaPatch -> runJavaTest -> restore, all real', async () => {
    // 1. Ingest the real Java fixture trace (committed at M0, D-016).
    const records = await ingest('fixtures/traces/java-1.48.0-timeout.zip');
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.brokenSelector).toBe('#save-btn-RENAMED');

    // 2. Identity resolves via the title tier — confirmed reaching the trace
    // verbatim at M0 (D-016), re-confirmed here through the real pipeline.
    const identity = resolveIdentity({ traceTitle: record.traceTitle }, 'fixtures/traces/java-1.48.0-timeout.zip');
    expect(identity.source).toBe('title');
    expect(identity.identity?.raw).toBe('DriftTest#savesTheForm');

    // 3. Score real candidates from the real snapshot.
    const candidates = filterCandidates(extractCandidates(record.snapshot.html));
    const scored = scoreCandidates(record.brokenSelector, candidates);
    expect(margin(scored)).toBeGreaterThanOrEqual(CONFIG_DEFAULTS.marginThreshold);
    const proposedId = scored[0].candidate.attrs.id;
    expect(proposedId).toBe('save-btn'); // the true target on semantic.html

    // 4. Resolve the patch location within the real java-suite project (not the
    // whole repo, which has 22 occurrences of this string across docs/tests —
    // see Task 58's --patch sanity check).
    const resolution = resolvePatch(javaSuiteRoot, record.brokenSelector);
    expect(resolution.action).toBe('patch');
    expect(resolution.occurrences[0].file).toContain('DriftTest.java');

    // 5. Verification availability: identity resolved AND a real adapter exists.
    const adapter: LanguageAdapter = {
      applyPatch: (file, oldSel, newSel) => applyJavaPatch(file, oldSel, newSel),
      runSingleTest: (id) => runJavaTest('maven', id, javaSuiteRoot),
    };
    const availability = checkVerificationAvailable(identity.identity, adapter);
    expect(availability.available).toBe(true);

    // 6. Apply the patch to the REAL file and run the REAL Maven test — this
    // should genuinely PASS, since semantic.html really does have id="save-btn".
    const before = readFileSync(driftTestFile, 'utf8');
    const patch = applyJavaPatch(driftTestFile, record.brokenSelector, `#${proposedId}`);
    expect(patch.after).toContain('"#save-btn"');
    expect(patch.after).not.toContain('#save-btn-RENAMED');

    let result;
    try {
      result = await runJavaTest('maven', identity.identity!, javaSuiteRoot);
    } finally {
      // 7. Restore, regardless of outcome — same guarantee verify.ts makes
      // (Task 56), applied manually here since this test drives the adapter
      // calls directly rather than through verify() itself.
      writeFileSync(driftTestFile, before, 'utf8');
    }

    expect(result.passed).toBe(true);
    expect(readFileSync(driftTestFile, 'utf8')).toBe(before); // file genuinely restored
  }, 120_000);

  it('with identity unavailable, patching still proceeds (D-007) — verified by resolving without a title', async () => {
    const records = await ingest('fixtures/traces/java-1.48.0-timeout.zip');
    const record = records[0];
    // Simulate an unresolvable identity (no title, no sidecar, filename doesn't
    // match the Class#method convention).
    const identity = resolveIdentity({ traceTitle: undefined }, 'traces/unmatched-name.zip');
    expect(identity.source).toBe('none');

    // Patch resolution (TRD §7) never needed identity in the first place — it's
    // a pure literal-string search — so it still finds and would patch the
    // occurrence even though identity is unresolved.
    const resolution = resolvePatch(javaSuiteRoot, record.brokenSelector);
    expect(resolution.action).toBe('patch');

    const availability = checkVerificationAvailable(identity.identity, {
      applyPatch: (f, o, n) => applyJavaPatch(f, o, n),
      runSingleTest: (id) => runJavaTest('maven', id, javaSuiteRoot),
    });
    expect(availability.available).toBe(false);
    expect(availability.reason).toContain('identity');
  });
});
