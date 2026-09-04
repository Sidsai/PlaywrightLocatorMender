import { describe, it, expect } from 'vitest';
import { attributeOverlap, roleMatch, textSimilarity, structuralProximity } from '../src/scoring/features.js';
import { parseSelector } from '../src/scoring/selector.js';
import type { Candidate } from '../src/candidates/extract.js';

function mk(overrides: Partial<Candidate>): Candidate {
  return { id: 'x', fingerprint: 'x', tag: 'BUTTON', role: 'button', attrs: {}, ...overrides };
}

describe('attributeOverlap', () => {
  it('scores an exact id match highest', () => {
    const parsed = parseSelector('#save-btn-RENAMED');
    const exact = mk({ attrs: { id: 'save-btn-RENAMED' } });
    const unrelated = mk({ attrs: { id: 'cancel-btn' } });
    expect(attributeOverlap(parsed, exact)).toBeGreaterThan(attributeOverlap(parsed, unrelated));
  });

  it('gives partial credit for a close (edit-distance) id match', () => {
    const parsed = parseSelector('#save-btn');
    const close = mk({ attrs: { id: 'save-btn-2' } }); // renamed with a small suffix
    const far = mk({ attrs: { id: 'zzzzzzzzzz' } });
    expect(attributeOverlap(parsed, close)).toBeGreaterThan(attributeOverlap(parsed, far));
  });

  it('scores 0 when the candidate has no comparable attribute at all', () => {
    const parsed = parseSelector('#save-btn');
    const noAttrs = mk({ attrs: {} });
    expect(attributeOverlap(parsed, noAttrs)).toBe(0);
  });
});

describe('roleMatch', () => {
  it('scores a candidate whose role matches the selector-implied role highest', () => {
    const parsed = parseSelector('button.row-action'); // tag BUTTON -> implicit role button
    const button = mk({ role: 'button' });
    const textbox = mk({ role: 'textbox' });
    expect(roleMatch(parsed, button)).toBeGreaterThan(roleMatch(parsed, textbox));
  });

  it('scores 0.5 (uncertain, not 0) when the selector carries no role-implying tag', () => {
    // An id-only selector like "#save-btn" gives no implicit role via TAG, so this
    // feature shouldn't confidently penalise every candidate to 0 — that would let
    // a weak signal masquerade as a strong negative one.
    const parsed = parseSelector('#save-btn');
    const anything = mk({ role: 'button' });
    expect(roleMatch(parsed, anything)).toBe(0.5);
  });
});

describe('textSimilarity', () => {
  it('scores a candidate with matching text highest', () => {
    const parsed = parseSelector('text="Save changes"');
    const exact = mk({ accessibleName: 'Save changes' });
    const unrelated = mk({ accessibleName: 'Cancel' });
    expect(textSimilarity(parsed, exact)).toBeGreaterThan(textSimilarity(parsed, unrelated));
  });

  it('normalises whitespace and case before comparing', () => {
    const parsed = parseSelector('text="Save changes"');
    const candidate = mk({ accessibleName: '  SAVE   changes  ' });
    expect(textSimilarity(parsed, candidate)).toBeGreaterThan(0.9);
  });

  it('returns 0 when the selector carries no text signal at all', () => {
    const parsed = parseSelector('#save-btn'); // no text= in an id selector
    const candidate = mk({ accessibleName: 'Save changes' });
    expect(textSimilarity(parsed, candidate)).toBe(0);
  });
});

describe('structuralProximity', () => {
  it('scores a candidate at a similar tree depth higher than one far off', () => {
    const parsed = parseSelector('form > button:nth-of-type(1)'); // depth 2
    const nearby = mk({ fingerprint: 'HTML[0]>BODY[1]>FORM[1]>BUTTON[4]' }); // depth 4
    const farAway = mk({ fingerprint: 'HTML[0]>BODY[1]>MAIN[0]>DIV[0]>DIV[0]>DIV[0]>SPAN[0]' }); // depth 7
    expect(structuralProximity(parsed, nearby)).toBeGreaterThan(structuralProximity(parsed, farAway));
  });

  it('scores an exact depth match at 1', () => {
    const parsed = parseSelector('a > b > c > d'); // depth 4
    const sameDepth = mk({ fingerprint: 'W[0]>X[0]>Y[0]>Z[0]' }); // depth 4
    expect(structuralProximity(parsed, sameDepth)).toBe(1);
  });
});
