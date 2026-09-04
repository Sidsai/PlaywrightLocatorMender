import type { TestIdentity } from '../../../trace/src/events.js';
import type { LanguageAdapter } from '../patch/adapter.js';

export interface AvailabilityCheck {
  available: boolean;
  reason?: string;
}

/**
 * Decides whether verification can even be attempted, per D-007/TRD §8: missing
 * identity or a missing language adapter blocks VERIFICATION only — patching
 * still proceeds regardless (patch resolution is a literal string search,
 * TRD §7, which never needed test identity or a language adapter to run).
 *
 * Callers use this BEFORE calling verify() — if unavailable, skip straight to a
 * RepairResult with verification: 'unavailable', never attempt the verify() call
 * at all (which would need a real identity/adapter to do anything meaningful).
 */
export function checkVerificationAvailable(
  identity: TestIdentity | undefined,
  adapter: LanguageAdapter | undefined,
): AvailabilityCheck {
  if (!adapter) {
    return { available: false, reason: 'no language adapter available for this binding' };
  }
  if (!identity || identity.source === 'none') {
    return { available: false, reason: 'test identity could not be resolved (D-008 precedence chain exhausted)' };
  }
  return { available: true };
}
