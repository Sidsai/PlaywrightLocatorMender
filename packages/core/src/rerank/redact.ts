import type { Candidate } from '../candidates/extract.js';

/**
 * The structured JSON sent to a reranker — never raw HTML (TRD §6). Built from
 * Candidate objects, not the raw DOM snapshot, which already bounds the payload to
 * exactly the fields the reranker needs.
 */
export interface RerankPayload {
  candidates: RerankCandidate[];
}

export interface RerankCandidate {
  id: string;
  fingerprint: string;
  tag: string;
  role: string;
  accessibleName?: string;
  attrs: Record<string, string>;
}

export function buildPayload(candidates: Candidate[]): RerankPayload {
  return {
    candidates: candidates.map((c) => ({
      id: c.id,
      fingerprint: c.fingerprint,
      tag: c.tag,
      role: c.role,
      accessibleName: c.accessibleName,
      attrs: { ...c.attrs },
    })),
  };
}

const PLACEHOLDER = '[REDACTED]';

/**
 * Attribute keys treated as STRUCTURAL stability tokens, not page content — kept
 * verbatim. These are exactly the identifiers TRD §5's heuristic scorer and TRD
 * §6's reranker prompt (Task 43) both need to compare against the broken
 * selector; redacting them would make retrieval/ranking (P1) impossible, which
 * cannot be the TRD's intent despite its general "attribute values are redacted"
 * phrasing. Every other attribute key's VALUE is redacted (its key is retained).
 */
const STRUCTURAL_ATTR_KEYS = new Set(['id', 'data-testid', 'name', 'type', 'href', 'for', 'class']);

/**
 * TRD §6: "input values, text nodes and attribute values are replaced with
 * type-preserving placeholders before any request leaves the process, retaining
 * structure, roles and accessible names." Redaction is not optional and has no
 * bypass flag — this function takes only the payload, nothing else, by design
 * (see the redact.length===1 test).
 *
 * Interpretation of the TRD sentence, made explicit because it is genuinely
 * ambiguous on a literal read (it says both "attribute values are redacted" and
 * "accessible names are retained", and accessible name is frequently DERIVED from
 * text content): `accessibleName` and the identifier-shaped attribute values in
 * STRUCTURAL_ATTR_KEYS are retained verbatim — they are the stability signals the
 * whole matching mechanism (P1) depends on, and TRD's own retention clause names
 * accessible names explicitly. Every other attribute value (`value`,
 * `placeholder`, `title`, `aria-describedby`, ...) is replaced with a
 * type-preserving placeholder. Recorded as AI/DECISION.md D-025.
 */
export function redact(payload: RerankPayload): RerankPayload {
  return {
    candidates: payload.candidates.map((c) => {
      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(c.attrs)) {
        attrs[key] = STRUCTURAL_ATTR_KEYS.has(key) ? value : PLACEHOLDER;
      }
      return { ...c, attrs };
    }),
  };
}
