import { fingerprint } from '../../../core/src/candidates/fingerprint.js';
import { TARGET_MARKER } from './types.js';

type Tree = unknown[]; // [tag: string, attrs: Record<string, unknown>, ...children]

function isElement(x: unknown): x is Tree {
  return Array.isArray(x) && typeof x[0] === 'string';
}

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** Deterministic pseudo-random float in [0, 1) from an integer seed (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects every element node in the tree, in the same deterministic traversal
 *  order extractCandidates uses (element children only, depth-first). */
export function collectElements(root: unknown): Tree[] {
  const out: Tree[] = [];
  (function walk(node: unknown) {
    if (!isElement(node)) return;
    out.push(node);
    for (const child of node.slice(2)) walk(child);
  })(root);
  return out;
}

/** Deterministically picks a target element for mutation: an element with an `id`
 *  attribute, chosen by seededRandom over the sorted candidate list so the same seed
 *  always picks the same element regardless of object key iteration order. */
export function pickTarget(root: unknown, seed: number): Tree | undefined {
  const withId = collectElements(root).filter((el) => typeof (el[1] as Record<string, unknown>)?.id === 'string');
  if (withId.length === 0) return undefined;
  withId.sort((a, b) => String((a[1] as Record<string, unknown>).id).localeCompare(String((b[1] as Record<string, unknown>).id)));
  const idx = Math.floor(seededRandom(seed)() * withId.length);
  return withId[idx];
}

/** Marks a target element in place (mutates the passed tree) with TARGET_MARKER. */
export function markTarget(target: Tree): void {
  (target[1] as Record<string, unknown>)[TARGET_MARKER] = 'true';
}

/** Finds the marked element in a (possibly mutated) tree and returns its
 *  fingerprint — the ground-truth id a correct repair proposal must resolve to. */
export function findMarkedFingerprint(root: unknown): string | null {
  let result: string | null = null;
  (function walk(node: unknown, path: Array<{ tag: string; index: number }>) {
    if (!isElement(node) || result) return;
    const attrs = node[1] as Record<string, unknown>;
    if (attrs?.[TARGET_MARKER] === 'true') {
      result = fingerprint(path);
      return;
    }
    const children = node.slice(2).filter(isElement);
    children.forEach((child, i) => walk(child, [...path, { tag: (child as Tree)[0] as string, index: i }]));
  })(root, isElement(root) ? [{ tag: root[0] as string, index: 0 }] : []);
  return result;
}

/** Strips the internal marker attribute from every element in the tree — call
 *  before handing a mutated snapshot to anything outside this package, so the
 *  marker never leaks into what a scorer sees. */
export function stripMarker(root: unknown): void {
  (function walk(node: unknown) {
    if (!isElement(node)) return;
    const attrs = node[1] as Record<string, unknown>;
    if (attrs) delete attrs[TARGET_MARKER];
    for (const child of node.slice(2)) walk(child);
  })(root);
}
