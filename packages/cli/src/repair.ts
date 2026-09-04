import { glob } from 'glob';
// Relative cross-package imports: no build step has run yet (no dist/ output), and
// the workspace links packages by directory, not by published artifact. These
// become package-name imports (@mender/trace, @mender/core) once a build/exports
// setup lands — tracked as a TODO for whichever milestone adds bundling (M7).
import { ingest } from '../../trace/src/ingest.js';
import { resolveIdentity } from '../../trace/src/identity.js';
import { extractCandidates } from '../../core/src/candidates/extract.js';
import { filterCandidates } from '../../core/src/candidates/filter.js';
import { scoreCandidates } from '../../core/src/scoring/heuristic.js';
import { margin as computeMargin } from '../../core/src/scoring/margin.js';
import { CONFIG_DEFAULTS } from '../../core/src/config.js';
import { renderStdout, type RepairResult } from '../../core/src/report/result.js';
import { resolvePatch } from '../../core/src/patch/resolve.js';
import { typeScriptAdapter, createTypeScriptAdapter } from '../../adapter-typescript/src/index.js';

export interface RepairOptions {
  trace: string[]; // one or more paths or glob patterns
  json?: boolean;
  patch?: boolean; // TRD §10: write the change to disk and print a diff
  marginThreshold?: number; // override CONFIG_DEFAULTS.marginThreshold
  patchRoot?: string; // project root to search for the broken selector (default: process.cwd())
}

export interface RepairRunResult {
  exitCode: number;
  output: string;
}

/**
 * Report-only CLI core (TRD §10 --dry-run mode, the default). Ingests every matched
 * trace, extracts and filters candidates, and scores them with the heuristic
 * scorer (M3) — this is TRD §5's offline mode: propose the top candidate only when
 * its margin over the runner-up clears the threshold, otherwise decline. No
 * confidence gate here (that's the reranker's addition, M4/Task 48) — offline mode
 * is margin-only per TRD §5's own description.
 */
export async function runRepair(options: RepairOptions): Promise<RepairRunResult> {
  const paths = (await Promise.all(options.trace.map((pattern) => glob(pattern)))).flat();
  const delta = options.marginThreshold ?? CONFIG_DEFAULTS.marginThreshold;

  const allJson: unknown[] = [];
  const lines: string[] = [];

  for (const path of paths) {
    let records;
    try {
      records = await ingest(path);
    } catch (e) {
      lines.push(`  ${path}: ${(e as Error).message}`);
      continue;
    }

    for (const record of records) {
      const identity = resolveIdentity({ traceTitle: record.traceTitle }, path);
      const candidates = record.snapshot.html
        ? filterCandidates(extractCandidates(record.snapshot.html))
        : [];

      const scored = scoreCandidates(record.brokenSelector, candidates);
      const m = computeMargin(scored);
      const proposeable = scored.length > 0 && m >= delta;

      const result: RepairResult = proposeable
        ? {
            outcome: 'proposed',
            proposed: scored[0].candidate.attrs.id
              ? `#${scored[0].candidate.attrs.id}`
              : `role=${scored[0].candidate.role}[name="${scored[0].candidate.accessibleName ?? ''}"]`,
            runnerUp: scored[1]
              ? scored[1].candidate.attrs.id
                ? `#${scored[1].candidate.attrs.id}`
                : `role=${scored[1].candidate.role}[name="${scored[1].candidate.accessibleName ?? ''}"]`
              : undefined,
            margin: m,
            verification: 'unavailable', // verifier doesn't exist until M5 (Task 56)
            rejected: {},
          }
        : {
            outcome: 'declined',
            declineReason:
              candidates.length === 0
                ? 'no candidates extracted from the snapshot'
                : `no candidate cleared the margin threshold (${delta})`,
            margin: scored.length > 0 ? m : undefined,
            verification: 'unavailable',
            rejected: {},
          };

      // --patch (TRD §10): write the change to disk and print a diff. Default
      // (dry-run) mode never reaches this branch's write calls at all.
      let patchLines: string[] = [];
      if (options.patch && result.outcome === 'proposed' && result.proposed) {
        const root = options.patchRoot ?? process.cwd();
        const resolution = resolvePatch(root, record.brokenSelector);
        if (resolution.action === 'decline') {
          patchLines = [`  patch declined: ${resolution.reason}`];
          if (resolution.occurrences.length > 1) {
            patchLines.push(...resolution.occurrences.map((o) => `    - ${o.file}:${o.line}`));
          }
        } else {
          const target = resolution.occurrences[0];
          const targetFile = `${root}/${target.file}`;
          // result.proposed already carries its own prefix ('#id' or a role=...
          // descriptor) — used verbatim as the literal replacement text.
          const adapter = root === process.cwd() ? typeScriptAdapter : createTypeScriptAdapter(root);
          const patch = adapter.applyPatch(targetFile, record.brokenSelector, result.proposed);
          patchLines = [
            `  patched ${target.file}:${target.line}`,
            `  --- ${target.file}`,
            `  +++ ${target.file}`,
            `  - ${patch.before.trim()}`,
            `  + ${patch.after.trim()}`,
          ];
        }
      }

      if (options.json) {
        allJson.push({
          trace: path,
          brokenSelector: record.brokenSelector,
          failureKind: record.failureKind,
          identitySource: identity.source,
          candidateCount: candidates.length,
          ...result,
          ...(patchLines.length > 0 ? { patch: patchLines.join('\n') } : {}),
        });
      } else {
        lines.push(`${path}`);
        lines.push(`  broken   ${record.brokenSelector}`);
        lines.push(`  ${candidates.length} candidates extracted`);
        lines.push(
          renderStdout(result)
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n'),
        );
        if (patchLines.length > 0) lines.push(...patchLines);
      }
    }
  }

  const output = options.json ? JSON.stringify(allJson) : lines.join('\n');
  return { exitCode: 0, output };
}
