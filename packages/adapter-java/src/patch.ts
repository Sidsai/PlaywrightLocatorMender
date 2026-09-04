import { readFileSync, writeFileSync } from 'node:fs';
import type { Patch } from '../../core/src/patch/adapter.js';

/**
 * Replaces a Java string literal only where it appears as a complete
 * double-quoted literal — Java has no single-quote string syntax (single quotes
 * are char literals), unlike the TypeScript adapter which handles both quote
 * styles. Works identically whether the literal is an inline call argument
 * (`page.locator("#save-btn").click()`) or a constant field declaration
 * (`private final String saveBtn = "#save-btn";`) — both are just "a double-
 * quoted literal with this exact text," so no special-casing is needed for
 * either shape, or for the literal living in a base class the failing test
 * inherits from (resolvePatch, TRD §7, already finds it there via the same
 * project-wide literal search that handles TypeScript's Page Object Model case).
 *
 * A dynamically constructed selector (`"#row-" + id`) is NEVER matched here —
 * it falls out of resolvePatch's own design (TRD §7) rather than needing
 * Java-specific detection: the concatenated runtime value ("#row-5") never
 * appears as source text at all, so the literal search finds zero occurrences
 * and declines before applyPatch is ever called.
 */
export function applyJavaPatch(file: string, oldSelector: string, newSelector: string): Patch {
  const before = readFileSync(file, 'utf8');
  const escapedOld = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"${escapedOld}"`, 'g');
  const after = before.replace(pattern, `"${newSelector}"`);
  writeFileSync(file, after, 'utf8');
  return { file, before, after };
}
