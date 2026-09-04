import { writeFileSync } from 'node:fs';
import { sweepDelta, selectOperatingPoint } from './sweep.js';
import { scoreProposer, type Proposer, type BenchmarkReport } from './report.js';
import { scoreCandidates } from '../../../core/src/scoring/heuristic.js';
import { margin } from '../../../core/src/scoring/margin.js';
import { extractCandidates } from '../../../core/src/candidates/extract.js';
import { filterCandidates } from '../../../core/src/candidates/filter.js';
import { listCorpusEntries, loadCorpusEntry } from '../corpus/load.js';
import { generateCases } from '../mutate/engine.js';
import type { MutationResult } from '../mutate/types.js';

/**
 * Publishes the heuristic-only baseline (TRD §5: "the heuristic scorer's full
 * metrics are published before the reranker is built, so every later number has a
 * baseline to be read against") — per-mutation-class breakdown plus overall, using
 * the delta chosen by sweepDelta/selectOperatingPoint against the real corpus.
 */
export async function publishHeuristicBaseline(corpusDir: string, seed: number, casesPerEntry: number) {
  const entries = listCorpusEntries(corpusDir);
  const allCases = entries.flatMap((e) => generateCases(loadCorpusEntry(corpusDir, e.id), seed, casesPerEntry));

  const points = sweepDelta(allCases);
  const operatingPoint = selectOperatingPoint(points);
  const delta = operatingPoint?.delta ?? 0.15; // pre-corpus default if nothing clears the bar

  const proposer: Proposer = {
    propose(c: MutationResult) {
      const candidates = filterCandidates(extractCandidates(c.mutated));
      if (candidates.length === 0) return null;
      const scored = scoreCandidates(c.brokenSelector, candidates);
      if (scored.length === 0) return null;
      return margin(scored) >= delta ? scored[0].candidate.id : null;
    },
  };

  const overall = scoreProposer(proposer, allCases);
  const byClass = new Map<string, BenchmarkReport>();
  for (const cls of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'] as const) {
    const classCases = allCases.filter((c) => c.class === cls);
    if (classCases.length > 0) byClass.set(cls, scoreProposer(proposer, classCases));
  }

  const lines: string[] = [];
  lines.push('# Heuristic Baseline Results');
  lines.push('');
  lines.push(`Generated against ${allCases.length} cases from the committed corpus (${entries.length} sources).`);
  lines.push(
    operatingPoint
      ? `Operating point: delta=${delta} (chosen by sweepDelta/selectOperatingPoint — largest coverage clearing the 3% Wilson-bound bar).`
      : `No delta in [0, 0.5] cleared the 3% false-repair-rate bar; reporting at the pre-corpus default delta=${delta} instead (TRD §14: "heuristics match the model... acceptable — report it").`,
  );
  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Repair rate | ${(overall.repairRate * 100).toFixed(1)}% |`);
  lines.push(`| False-repair rate (Wilson 95% upper) | ${(overall.falseRepairRateWilsonUpper * 100).toFixed(2)}% |`);
  lines.push(`| Abstention accuracy | ${(overall.abstentionAccuracy * 100).toFixed(1)}% |`);
  lines.push(`| Total cases | ${overall.totalCases} |`);
  lines.push('');
  lines.push('## Per mutation class');
  lines.push('');
  lines.push('| Class | Cases | Repair rate | FRR (Wilson upper) | Abstention accuracy |');
  lines.push('|---|---|---|---|---|');
  for (const [cls, report] of byClass) {
    lines.push(
      `| ${cls} | ${report.totalCases} | ${(report.repairRate * 100).toFixed(1)}% | ${(report.falseRepairRateWilsonUpper * 100).toFixed(2)}% | ${(report.abstentionAccuracy * 100).toFixed(1)}% |`,
    );
  }
  lines.push('');

  writeFileSync('packages/bench/RESULTS-heuristics.md', lines.join('\n'));
  return { overall, byClass, delta };
}
