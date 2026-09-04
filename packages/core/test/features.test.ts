import { describe, it, expect } from 'vitest';
import {
  attributeOverlap,
  roleMatch,
  textSimilarity,
  structuralProximity,
  uniquenessPenalty,
} from '../src/scoring/features.js';
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

  it('a genuine prefix-preserving rename outscores an unrelated id with a coincidental shared suffix (D-023)', () => {
    // Found via Task 39's real-corpus sweep: this exact case produced a 0% M1
    // repair rate before identifierSimilarity's containment check was added.
    const parsed = parseSelector('#save-btn');
    const renamed = mk({ attrs: { id: 'save-btn-renamed-5' } }); // the true, mutated target
    const coincidental = mk({ attrs: { id: 'cancel-btn' } }); // shares only "-btn"
    expect(attributeOverlap(parsed, renamed)).toBeGreaterThan(attributeOverlap(parsed, coincidental));
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

describe('uniquenessPenalty — the M6 defense', () => {
  // Decoy text mirrors mutateM6's own generation pattern ("${text} draft" — see
  // packages/bench/src/mutate/m6.ts): prefix-preserving, genuinely near-identical,
  // not just thematically related. A decoy built from unrelated words would be an
  // unrealistically easy test of this exact defense (TRD §14's risk row).
  it('penalises a candidate that has a near-identical twin', () => {
    const target = mk({ id: 'a', role: 'button', accessibleName: 'Save changes' });
    const twin = mk({ id: 'b', role: 'button', accessibleName: 'Save changes draft' });
    const all = [target, twin];
    expect(uniquenessPenalty(target, all)).toBeLessThan(1);
  });

  it('does not penalise a candidate with no similar siblings', () => {
    const target = mk({ id: 'a', role: 'button', accessibleName: 'Save changes' });
    const unrelated = mk({ id: 'b', role: 'textbox', accessibleName: 'Username' });
    const all = [target, unrelated];
    expect(uniquenessPenalty(target, all)).toBe(1);
  });

  it('penalises more heavily as more near-identical twins pile up', () => {
    const target = mk({ id: 'a', role: 'button', accessibleName: 'Save changes' });
    const twins3 = [
      target,
      mk({ id: 'b', role: 'button', accessibleName: 'Save changes draft' }),
      mk({ id: 'c', role: 'button', accessibleName: 'Save changes copy' }),
      mk({ id: 'd', role: 'button', accessibleName: 'Save changes all' }),
    ];
    const twins1 = [target, mk({ id: 'b', role: 'button', accessibleName: 'Save changes draft' })];
    expect(uniquenessPenalty(target, twins3)).toBeLessThan(uniquenessPenalty(target, twins1));
  });
});
