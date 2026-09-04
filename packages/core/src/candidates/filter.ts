import type { Candidate } from './extract.js';

export interface FilterOptions {
  region?: { x: number; y: number; width: number; height: number };
  cap?: number; // default 200, per TRD §4
}

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'tab',
  'switch',
]);

function overlaps(
  bounds: { x: number; y: number; width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    bounds.x < region.x + region.width &&
    bounds.x + bounds.width > region.x &&
    bounds.y < region.y + region.height &&
    bounds.y + bounds.height > region.y
  );
}

/**
 * Filters a raw candidate list per TRD §4:
 *   - drop non-interactive containers with no accessible name;
 *   - drop elements outside the viewport region of the failed action, where that
 *     region is known (fail open when bounds or region are unknown — never drop on
 *     absence of information);
 *   - cap at 200, taken AFTER the list is already in its deterministic sort order
 *     (extractCandidates sorts by fingerprint), so the cap never depends on input
 *     order.
 */
export function filterCandidates(candidates: Candidate[], options: FilterOptions = {}): Candidate[] {
  const cap = options.cap ?? 200;

  let result = candidates.filter((c) => {
    const isInteractive = INTERACTIVE_ROLES.has(c.role);
    if (!isInteractive && !c.accessibleName) return false;
    return true;
  });

  if (options.region) {
    const region = options.region;
    result = result.filter((c) => !c.bounds || overlaps(c.bounds, region));
  }

  // Sort by fingerprint before capping — the cap must not depend on the order
  // candidates happened to arrive in (TRD §4). extractCandidates already sorts this
  // way, but filterCandidates doesn't trust the caller to have preserved that; it
  // re-establishes the same deterministic order itself.
  result.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

  return result.slice(0, cap);
}
