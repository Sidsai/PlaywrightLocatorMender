import { writeFileSync } from 'node:fs';
import type { LanguageAdapter } from '../patch/adapter.js';
import type { TestIdentity } from '../../../trace/src/events.js';

export interface VerificationResult {
  verified: boolean;
  reason?: string;
  timedOut?: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('verification timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * TRD §9's verifier. Applies the proposal, runs the single affected test, and
 * discards the proposal (verified: false) unless it passes. Timeout is 2x the
 * original test's recorded duration.
 *
 * THE LOAD-BEARING GUARANTEE: the original file is restored regardless of
 * outcome — success, failure, OR an exception thrown by the adapter itself
 * (e.g. the test runner crashing). This is why the restore lives in a `finally`
 * block wrapping the entire operation, not just the success and failure paths —
 * an uncaught exception between patch and restore would leave a user's real
 * source file permanently mutated, which is the one outcome this function exists
 * to prevent. Tested explicitly (Task 56): the throw path is not incidental.
 */
export async function verify(
  adapter: LanguageAdapter,
  file: string,
  oldSelector: string,
  newSelector: string,
  identity: TestIdentity,
  originalDurationMs: number,
): Promise<VerificationResult> {
  const patch = adapter.applyPatch(file, oldSelector, newSelector);

  try {
    const result = await withTimeout(adapter.runSingleTest(identity), originalDurationMs * 2);
    return result.passed
      ? { verified: true }
      : { verified: false, reason: 'proposal applied but the test still failed' };
  } catch (e) {
    const message = (e as Error).message;
    return {
      verified: false,
      reason: message,
      timedOut: message === 'verification timed out',
    };
  } finally {
    // Runs on every path: success, failure, AND an uncaught throw from
    // runSingleTest or withTimeout. This is the guarantee, not an incidental
    // cleanup — a user's real file must never be left mutated by a verification
    // attempt, regardless of how that attempt ended.
    writeFileSync(file, patch.before, 'utf8');
  }
}
