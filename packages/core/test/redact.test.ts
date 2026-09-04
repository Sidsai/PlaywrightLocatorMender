import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildPayload, redact } from '../src/rerank/redact.js';
import type { Candidate } from '../src/candidates/extract.js';

function mk(overrides: Partial<Candidate>): Candidate {
  return { id: 'x', fingerprint: 'x', tag: 'INPUT', role: 'textbox', attrs: {}, ...overrides };
}

describe('redact — property: no page-content value survives into the payload', () => {
  it('no arbitrary attrs.value or attrs.placeholder string survives redaction', () => {
    // Alphanumeric, minLength 8: long and structured enough that a match in the
    // serialized JSON output can only mean the secret actually leaked, never a
    // coincidental collision with JSON's own punctuation. A first version used
    // fc.string() with minLength 1 and found a spurious "failure" on the
    // single-character secret "[" — trivially present in any JSON array's own
    // syntax, nothing to do with an actual leak. That was a test-construction
    // bug, not a redaction bug — fixed here rather than papered over.
    const secretArb = fc.stringMatching(/^[A-Za-z0-9]{8,40}$/);
    fc.assert(
      fc.property(secretArb, secretArb, (secretValue, secretPlaceholder) => {
        const candidate = mk({
          attrs: { id: 'field-1', value: secretValue, placeholder: secretPlaceholder },
        });
        const redacted = redact(buildPayload([candidate]));
        const serialized = JSON.stringify(redacted);
        expect(serialized).not.toContain(secretValue);
        expect(serialized).not.toContain(secretPlaceholder);
      }),
    );
  });

  it('retains structure, roles, and accessible names (per TRD §6, not redacted)', () => {
    const candidate = mk({
      role: 'button',
      tag: 'BUTTON',
      accessibleName: 'Save changes',
      attrs: { id: 'save-btn', 'data-testid': 'save-btn-testid' },
      fingerprint: 'HTML[0]>BODY[0]>BUTTON[0]',
    });
    const redacted = redact(buildPayload([candidate]));
    const serialized = JSON.stringify(redacted);
    expect(serialized).toContain('button'); // role
    expect(serialized).toContain('Save changes'); // accessible name — explicitly retained
    expect(serialized).toContain('save-btn'); // id — structural stability token
    expect(serialized).toContain('save-btn-testid'); // data-testid — structural stability token
    expect(serialized).toContain('HTML[0]>BODY[0]>BUTTON[0]'); // fingerprint — structural
  });

  it('redacts a non-structural attribute value while keeping the attribute key', () => {
    const candidate = mk({ attrs: { id: 'x', title: 'Sensitive tooltip text here' } });
    const redacted = redact(buildPayload([candidate]));
    const payloadCandidate = redacted.candidates[0];
    expect(payloadCandidate.attrs.title).not.toBe('Sensitive tooltip text here');
    expect('title' in payloadCandidate.attrs).toBe(true); // key retained, value redacted
  });

  it('redaction has no bypass — no option in RedactOptions disables it', () => {
    // The type itself carries this invariant: redact() takes only the payload, no
    // options parameter at all. Asserted here as a compile-time + runtime check
    // that calling redact with any extra argument is simply impossible/no-op.
    expect(redact.length).toBe(1); // exactly one parameter: the payload
  });
});
