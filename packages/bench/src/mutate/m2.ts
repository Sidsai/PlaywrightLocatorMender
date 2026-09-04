import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker, seededRandom } from './helpers.js';
import type { MutationResult } from './types.js';

/** M2 — swap utility class strings (PRD §9, repairable). The id is left untouched
 *  so the broken selector is specifically a class-based one, not the id. */
export function mutateM2(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM2: no element with an id attribute found in this snapshot');

  const attrs = target[1] as Record<string, string>;
  const oldClass = attrs.class ?? '';
  markTarget(target);
  const rand = seededRandom(seed + 1000);
  attrs.class = `cls-${Math.floor(rand() * 1_000_000).toString(36)}`;

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return {
    mutated,
    groundTruthId,
    class: 'M2',
    brokenSelector: oldClass ? `.${oldClass.split(' ')[0]}` : '',
  };
}
