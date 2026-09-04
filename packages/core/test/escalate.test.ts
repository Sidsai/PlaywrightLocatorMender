import { describe, it, expect, vi } from 'vitest';
import { escalate } from '../src/rerank/escalate.js';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('escalate — ambiguity escalation (D-006)', () => {
  it('does NOT escalate when margin already clears the threshold', async () => {
    const castVote = vi.fn();
    const result = await escalate(0.2, 0.15, 'a', castVote);
    expect(result.escalated).toBe(false);
    expect(result.chosenCandidateId).toBe('a');
    expect(castVote).not.toHaveBeenCalled();
  });

  it('does NOT escalate when the initial choice was already a decline (null)', async () => {
    const castVote = vi.fn();
    const result = await escalate(0.05, 0.15, null, castVote);
    expect(result.escalated).toBe(false);
    expect(result.chosenCandidateId).toBeNull();
    expect(castVote).not.toHaveBeenCalled();
  });

  it('proposes on unanimous agreement across votes', async () => {
    const castVote = vi.fn().mockResolvedValue('a');
    const result = await escalate(0.05, 0.15, 'a', castVote, 3);
    expect(result.escalated).toBe(true);
    expect(result.chosenCandidateId).toBe('a');
    expect(castVote).toHaveBeenCalledTimes(3);
  });

  it('declines on any disagreement among votes', async () => {
    let call = 0;
    const castVote = vi.fn().mockImplementation(async () => (call++ === 1 ? 'b' : 'a'));
    const result = await escalate(0.05, 0.15, 'a', castVote, 3);
    expect(result.escalated).toBe(true);
    expect(result.chosenCandidateId).toBeNull();
    expect(result.votes).toEqual(['a', 'b', 'a']);
  });

  it('declines if any vote itself declines (null breaks unanimity)', async () => {
    let call = 0;
    const castVote = vi.fn().mockImplementation(async () => (call++ === 1 ? null : 'a'));
    const result = await escalate(0.05, 0.15, 'a', castVote, 3);
    expect(result.chosenCandidateId).toBeNull();
  });

  it('votes are cast CONCURRENTLY, not serially — wall-clock is ~one call, not voteCount calls', async () => {
    const perCallDelay = 200;
    const castVote = vi.fn().mockImplementation(async () => {
      await delay(perCallDelay);
      return 'a';
    });

    const start = Date.now();
    await escalate(0.05, 0.15, 'a', castVote, 5);
    const elapsed = Date.now() - start;

    // Serial would be ~5 * 200ms = 1000ms; concurrent should be ~200ms plus
    // scheduling slack. Generous upper bound to avoid CI flakiness while still
    // clearly distinguishing concurrent from serial.
    expect(elapsed).toBeLessThan(perCallDelay * 2.5);
  });
});
