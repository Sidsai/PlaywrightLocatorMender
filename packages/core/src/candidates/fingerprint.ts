/**
 * A structural path fingerprint: tag names joined by their sibling-element index at
 * each level (text nodes don't count toward the index). Depends only on tree shape
 * and tag names — never on attribute key insertion order — so it is stable across
 * two snapshots that differ only in how their attribute objects were built
 * (TRD §4's determinism requirement).
 */
export function fingerprint(path: Array<{ tag: string; index: number }>): string {
  return path.map((p) => `${p.tag}[${p.index}]`).join('>');
}
