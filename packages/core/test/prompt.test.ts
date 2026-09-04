import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/rerank/prompt.js';
import { parseRerankResponse } from '../src/rerank/schema.js';
import type { Candidate } from '../src/candidates/extract.js';

function mk(overrides: Partial<Candidate>): Candidate {
  return { id: 'x', fingerprint: 'x', tag: 'BUTTON', role: 'button', attrs: {}, ...overrides };
}

describe('buildPrompt', () => {
  it('the payload contains structured candidate JSON, never raw HTML', () => {
    const candidates = [mk({ attrs: { id: 'save-btn' }, accessibleName: 'Save changes' })];
    const prompt = buildPrompt('#save-btn-RENAMED', 'Frame.click', candidates, 'timeout');
    const serialized = JSON.stringify(prompt.payload);
    expect(serialized).not.toContain('<'); // no raw HTML tag markers at all
    expect(serialized).toContain('save-btn');
  });

  it('uses a different system prompt for strict-mode violations (choose + narrow, not replace)', () => {
    const candidates = [mk({})];
    const timeoutPrompt = buildPrompt('#x', 'Frame.click', candidates, 'timeout');
    const strictPrompt = buildPrompt('.row-action', 'Frame.click', candidates, 'strict_violation');
    expect(strictPrompt.systemPrompt).not.toBe(timeoutPrompt.systemPrompt);
    expect(strictPrompt.systemPrompt.toLowerCase()).toContain('narrow');
  });

  it('the payload is redacted (a secret attribute value does not survive)', () => {
    const candidates = [mk({ attrs: { id: 'x', value: 'super-secret-user-data-12345' } })];
    const prompt = buildPrompt('#x', 'Frame.fill', candidates, 'timeout');
    expect(JSON.stringify(prompt.payload)).not.toContain('super-secret-user-data-12345');
  });
});

describe('parseRerankResponse — schema enforcement', () => {
  it('accepts a well-formed proposal response', () => {
    const parsed = parseRerankResponse({
      chosenCandidateId: 'HTML[0]>BODY[0]>BUTTON[0]',
      confidence: 0.9,
      reasoning: 'exact id match',
      rejectedReasons: { 'HTML[0]>BODY[0]>BUTTON[1]': 'wrong role' },
    });
    expect(parsed.chosenCandidateId).toBe('HTML[0]>BODY[0]>BUTTON[0]');
  });

  it('accepts chosenCandidateId: null as a valid decline, not an error', () => {
    const parsed = parseRerankResponse({
      chosenCandidateId: null,
      confidence: 0,
      reasoning: 'no safe match',
      rejectedReasons: {},
    });
    expect(parsed.chosenCandidateId).toBeNull();
  });

  it('rejects a response missing chosenCandidateId entirely', () => {
    expect(() =>
      parseRerankResponse({ confidence: 0.5, reasoning: 'x', rejectedReasons: {} }),
    ).toThrow();
  });

  it('rejects a confidence outside [0, 1]', () => {
    expect(() =>
      parseRerankResponse({ chosenCandidateId: 'x', confidence: 1.5, reasoning: '', rejectedReasons: {} }),
    ).toThrow();
  });
});
