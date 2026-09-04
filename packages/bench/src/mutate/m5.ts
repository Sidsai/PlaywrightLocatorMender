import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker, seededRandom } from './helpers.js';
import type { MutationResult } from './types.js';

type Tree = unknown[];

const SYNONYM_EDITS: Array<(s: string) => string> = [
  (s) => s.replace(/\bSave\b/, 'Save & continue'),
  (s) => s.replace(/\bchanges\b/, 'edits'),
  (s) => `${s}!`,
  (s) => s.toLowerCase(),
  (s) => s.replace(/\bCancel\b/, 'Dismiss'),
];

/** M5 — alter visible text slightly (PRD §9, repairable). Bounded so the result
 *  stays recognisably similar — an unbounded change is really an M7-shaped case,
 *  which would corrupt the benchmark's own label if mislabelled as repairable M5. */
export function mutateM5(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM5: no element with an id attribute found in this snapshot');

  const t = target as Tree;
  const textIndex = t.findIndex((c, i) => i >= 2 && typeof c === 'string');
  if (textIndex === -1) throw new Error('mutateM5: target has no direct text content to alter');

  const oldText = t[textIndex] as string;
  markTarget(t);
  const rand = seededRandom(seed + 3000);
  const edit = SYNONYM_EDITS[Math.floor(rand() * SYNONYM_EDITS.length)];
  let newText = edit(oldText);
  if (newText === oldText) newText = `${oldText} `; // guarantee a change even if the pattern didn't match
  t[textIndex] = newText;

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return {
    mutated,
    groundTruthId,
    class: 'M5',
    brokenSelector: `text="${oldText}"`,
  };
}
