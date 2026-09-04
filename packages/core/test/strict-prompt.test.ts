import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/rerank/prompt.js';
import type { Candidate } from '../src/candidates/extract.js';

function mk(overrides: Partial<Candidate>): Candidate {
  return { id: 'x', fingerprint: 'x', tag: 'BUTTON', role: 'button', attrs: {}, ...overrides };
}

describe('strict-mode prompt variant (TRD §6, Task 45)', () => {
  it('asks which matched element was intended, not for a fresh replacement', () => {
    const candidates = [mk({})];
    const prompt = buildPrompt('button.row-action', 'Frame.click', candidates, 'strict_violation');
    const lower = prompt.systemPrompt.toLowerCase();
    expect(lower).toContain('intended');
    expect(lower).not.toMatch(/find a replacement|propose a replacement selector/);
  });

  it('requests a narrowing qualifier, explicitly distinguished from a full replacement selector', () => {
    const candidates = [mk({})];
    const prompt = buildPrompt('button.row-action', 'Frame.click', candidates, 'strict_violation');
    expect(prompt.systemPrompt.toLowerCase()).toContain('narrowing qualifier');
  });

  it('the timeout-case prompt does NOT ask for a narrowing qualifier — the two variants are genuinely distinct', () => {
    const candidates = [mk({})];
    const prompt = buildPrompt('#save-btn-RENAMED', 'Frame.click', candidates, 'timeout');
    expect(prompt.systemPrompt.toLowerCase()).not.toContain('narrowing qualifier');
  });
});
