import type { TestIdentity } from '../../../trace/src/events.js';

export interface Patch {
  file: string;
  before: string; // full original file content — needed to revert (Task 56, the verifier)
  after: string; // full patched file content
}

export interface TestResult {
  passed: boolean;
  output: string;
  durationMs: number;
}

/**
 * TRD §8's language adapter interface. Every language (TypeScript, Java, ...)
 * implements exactly these two operations. Only the last two pipeline stages
 * (Patch Resolver, Verifier) import an adapter — everything above stays
 * language-agnostic (TRD §1).
 */
export interface LanguageAdapter {
  applyPatch(file: string, oldSelector: string, newSelector: string): Patch;
  runSingleTest(identity: TestIdentity): Promise<TestResult>;
}
