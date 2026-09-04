// Public API for playwright-mender-bench (PRD §9): any locator-healing tool can
// be scored against this benchmark using these exports.

export { wilsonUpper } from './score/wilson.js';
export { scoreProposer, type Proposer, type BenchmarkReport } from './score/report.js';
export { sweepDelta, selectOperatingPoint, type SweepPoint } from './score/sweep.js';
export { publishHeuristicBaseline } from './score/publish.js';

export { capturePage } from './corpus/capture.js';
export { loadCorpusEntry, listCorpusEntries, type CorpusManifest, type CorpusManifestEntry } from './corpus/load.js';
export { buildCorpus, casesPerSource } from './corpus/build.js';

export { generateCases } from './mutate/engine.js';
export type { MutationResult, MutationClass } from './mutate/types.js';
export { mutateM1 } from './mutate/m1.js';
export { mutateM2 } from './mutate/m2.js';
export { mutateM3 } from './mutate/m3.js';
export { mutateM4 } from './mutate/m4.js';
export { mutateM5 } from './mutate/m5.js';
export { mutateM6 } from './mutate/m6.js';
export { mutateM7 } from './mutate/m7.js';
export { mutateM8 } from './mutate/m8.js';
