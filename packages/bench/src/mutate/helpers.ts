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

/**
 * Deterministically picks a target element for mutation, preferring an element
 * with a real `id` attribute (sorted by id, then chosen by seededRandom, so the
 * same seed always picks the same element regardless of object key order).
 *
 * FALLBACK, found via Task 32's real corpus build: two of the six DOM-idiom
 * fixtures (utility-css.html, css-in-js.html) were deliberately built WITHOUT id
 * attributes — that's the entire point of those idioms (PRD §9: "utility CSS...no
 * semantic hooks"). Requiring id unconditionally meant the mutation engine could
 * generate zero cases from exactly the idioms it exists to stress-test, silently
 * halving the corpus's effective size (found as "501 cases instead of >=1000" in
 * the build test — see AI/DECISION.md D-022).
 *
 * The fallback returns any element with a `class` attribute or non-empty text — it
 * does NOT fabricate an id. A page that never had an id-based hook genuinely has no
 * realistic "id was renamed" drift scenario (M1), and mutateM1 (which reads
 * `attrs.id` directly) correctly throws for such a target — engine.ts's own
 * same-class-then-other-class retry logic (D-021) already handles falling through
 * to a class that DOES apply, e.g. M2 (class swap) or M3/M4 (structural, need
 * neither id nor class). Classes that build an `#id`-based broken-selector string
 * (M6, M7, M8) fall back to a class- or structural-selector when id is absent —
 * see each file's own selector-construction logic.
 */
export function pickTarget(root: unknown, seed: number): Tree | undefined {
  const elements = collectElements(root);
  const withId = elements.filter((el) => typeof (el[1] as Record<string, unknown>)?.id === 'string');

  if (withId.length > 0) {
    withId.sort((a, b) => String((a[1] as Record<string, unknown>).id).localeCompare(String((b[1] as Record<string, unknown>).id)));
    const idx = Math.floor(seededRandom(seed)() * withId.length);
    return withId[idx];
  }

  const withClass = elements.filter((el) => typeof (el[1] as Record<string, unknown>)?.class === 'string');
  if (withClass.length > 0) {
    withClass.sort((a, b) => String((a[1] as Record<string, unknown>).class).localeCompare(String((b[1] as Record<string, unknown>).class)));
    const idx = Math.floor(seededRandom(seed)() * withClass.length);
    return withClass[idx];
  }

  const withText = elements.filter((el) => el.slice(2).some((c) => typeof c === 'string' && (c as string).trim()));
  if (withText.length > 0) {
    const idx = Math.floor(seededRandom(seed)() * withText.length);
    return withText[idx];
  }

  return undefined;
}

/** Builds the best available CSS-ish selector description for an element: id if
 *  present, else its first class token, else undefined (caller should fall back to
 *  a structural selector, as M3/M4 already do). Used by mutate functions (M6, M7,
 *  M8) that need SOME selector string to report as "broken" but whose actual
 *  mutation mechanism doesn't strictly require id. */
export function bestSelector(target: Tree): string | undefined {
  const attrs = target[1] as Record<string, string>;
  if (attrs.id) return `#${attrs.id}`;
  if (attrs.class) return `.${attrs.class.split(' ')[0]}`;
  return undefined;
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
