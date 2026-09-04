import { fingerprint } from './fingerprint.js';

export interface Candidate {
  id: string; // structural fingerprint — stable, unique per position in the snapshot
  tag: string;
  role: string;
  accessibleName?: string;
  text?: string;
  attrs: Record<string, string>; // stable-looking attributes only: id, name, data-testid, aria-*
  fingerprint: string;
  /** Viewport-relative bounding box, when known. Not populated by extractCandidates
   *  itself — the accessibility-reduced snapshot tree carries no layout info; a
   *  future stage that has access to real render geometry can attach this. Filtering
   *  (Task 17) treats an absent value as "unknown" and does not exclude on that basis
   *  (fail open, per TRD §4: "drop elements outside the viewport region... where that
   *  region is known"). */
  bounds?: { x: number; y: number; width: number; height: number };
}

type SnapshotNode = unknown[]; // [tag: string, attrs: Record<string, unknown>, ...children]

function isElementNode(x: unknown): x is SnapshotNode {
  return Array.isArray(x) && typeof x[0] === 'string' && x[0] === x[0].toUpperCase() && x[0].length > 0;
}

function attrsOf(node: SnapshotNode): Record<string, unknown> {
  const a = node[1];
  return a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : {};
}

function childrenOf(node: SnapshotNode): unknown[] {
  return node.slice(2);
}

/** Direct text content: string children concatenated and whitespace-normalised. */
function directText(node: SnapshotNode): string {
  return childrenOf(node)
    .filter((c): c is string => typeof c === 'string')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const STABLE_ATTR_KEYS = ['id', 'name', 'data-testid', 'for', 'type', 'href'];

function stableAttrs(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue;
    if (STABLE_ATTR_KEYS.includes(k) || k.startsWith('aria-') || k.startsWith('data-testid')) {
      out[k] = v;
    }
  }
  return out;
}

const IMPLICIT_ROLES: Record<string, string> = {
  BUTTON: 'button',
  A: 'link',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  FORM: 'form',
  IMG: 'img',
  TABLE: 'table',
  UL: 'list',
  OL: 'list',
  LI: 'listitem',
};

function inferRole(tag: string, attrs: Record<string, unknown>): string {
  const explicit = attrs.role;
  if (typeof explicit === 'string') return explicit;
  if (tag === 'INPUT') {
    const type = typeof attrs.type === 'string' ? attrs.type : 'text';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button') return 'button';
    return 'textbox';
  }
  return IMPLICIT_ROLES[tag] ?? 'generic';
}

/**
 * Extracts every element in the snapshot as a Candidate, in a deterministic order.
 * Determinism (TRD §4) holds because:
 *   - the fingerprint/id depends only on tag names and structural (sibling-index)
 *     position, never on attribute object key insertion order;
 *   - the final list is explicitly sorted by fingerprint, so traversal-order
 *     incidentals can't leak into the result either.
 *
 * Filtering (drop non-interactive/no-name elements, viewport scoping, 200 cap) is a
 * separate stage (Task 17) — this function returns every element, unfiltered.
 */
export function extractCandidates(root: unknown): Candidate[] {
  // First pass: collect <label for="id"> -> label text, for accessible-name resolution.
  const labelFor = new Map<string, string>();
  (function collectLabels(node: unknown) {
    if (!isElementNode(node)) return;
    const attrs = attrsOf(node);
    if (node[0] === 'LABEL' && typeof attrs.for === 'string') {
      labelFor.set(attrs.for, directText(node));
    }
    for (const child of childrenOf(node)) collectLabels(child);
  })(root);

  const candidates: Candidate[] = [];

  (function walk(node: unknown, path: Array<{ tag: string; index: number }>) {
    if (!isElementNode(node)) return;
    const tag = node[0] as string;
    const rawAttrs = attrsOf(node);
    const attrs = stableAttrs(rawAttrs);
    const text = directText(node);
    const id = typeof rawAttrs.id === 'string' ? rawAttrs.id : undefined;
    const ariaLabel = typeof rawAttrs['aria-label'] === 'string' ? rawAttrs['aria-label'] : undefined;
    const placeholder = typeof rawAttrs.placeholder === 'string' ? rawAttrs.placeholder : undefined;

    const accessibleName =
      ariaLabel ?? (id ? labelFor.get(id) : undefined) ?? (text || undefined) ?? placeholder;

    const fp = fingerprint(path);
    candidates.push({
      id: fp,
      tag,
      role: inferRole(tag, rawAttrs),
      accessibleName,
      text: text || undefined,
      attrs,
      fingerprint: fp,
    });

    const elementChildren = childrenOf(node).filter(isElementNode);
    elementChildren.forEach((child, i) => {
      walk(child, [...path, { tag: (child as SnapshotNode)[0] as string, index: i }]);
    });
  })(root, isElementNode(root) ? [{ tag: root[0] as string, index: 0 }] : []);

  candidates.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  return candidates;
}
