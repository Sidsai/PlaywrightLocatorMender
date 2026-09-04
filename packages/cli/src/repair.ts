import { glob } from 'glob';
// Relative cross-package imports: no build step has run yet (no dist/ output), and
// the workspace links packages by directory, not by published artifact. These
// become package-name imports (@mender/trace, @mender/core) once a build/exports
// setup lands — tracked as a TODO for whichever milestone adds bundling (M7).
import { ingest } from '../../trace/src/ingest.js';
import { resolveIdentity } from '../../trace/src/identity.js';
import { extractCandidates } from '../../core/src/candidates/extract.js';
import { filterCandidates } from '../../core/src/candidates/filter.js';

export interface RepairOptions {
  trace: string[]; // one or more paths or glob patterns
  json?: boolean;
  patch?: boolean; // accepted, not yet acted on — Task 58
}

export interface RepairRunResult {
  exitCode: number;
  output: string;
}

/**
 * Report-only CLI core (TRD §10 --dry-run mode, the default). Ingests every matched
 * trace, extracts and filters candidates, and reports the broken selector per
 * failure. Scoring (heuristic/reranker) doesn't exist until M3/M4, so every record
 * currently reports "no proposal (scoring not yet implemented)" rather than a real
 * decline or proposal — that distinction matters: this is not P3's decline path, it's
 * an honest statement that the pipeline isn't finished yet.
 */
export async function runRepair(options: RepairOptions): Promise<RepairRunResult> {
  const paths = (await Promise.all(options.trace.map((pattern) => glob(pattern)))).flat();

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

      if (options.json) {
        allJson.push({
          trace: path,
          brokenSelector: record.brokenSelector,
          failureKind: record.failureKind,
          identitySource: identity.source,
          candidateCount: candidates.length,
        });
      } else {
        lines.push(`${path}`);
        lines.push(`  broken   ${record.brokenSelector}`);
        lines.push(`  ${candidates.length} candidates extracted`);
        lines.push(`  no proposal (scoring not yet implemented)`);
      }
    }
  }

  const output = options.json ? JSON.stringify(allJson) : lines.join('\n');
  return { exitCode: 0, output };
}
