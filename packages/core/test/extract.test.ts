import { describe, it, expect } from 'vitest';
import { extractCandidates } from '../src/candidates/extract.js';

const snap = [
  'BODY',
  {},
  [
    'FORM',
    { 'aria-label': 'Login form' },
    ['LABEL', { for: 'username' }, 'Username'],
    ['INPUT', { id: 'username', name: 'username', type: 'text' }],
    ['BUTTON', { id: 'save-btn', type: 'submit' }, 'Save changes'],
    ['BUTTON', { id: 'cancel-btn', type: 'button' }, 'Cancel'],
  ],
];

// Same content, attribute keys inserted in a different order.
const shuffled = [
  'BODY',
  {},
  [
    'FORM',
    { 'aria-label': 'Login form' },
    ['LABEL', { for: 'username' }, 'Username'],
    ['INPUT', { name: 'username', type: 'text', id: 'username' }],
    ['BUTTON', { type: 'submit', id: 'save-btn' }, 'Save changes'],
    ['BUTTON', { type: 'button', id: 'cancel-btn' }, 'Cancel'],
  ],
];

describe('extractCandidates', () => {
  it('is deterministic across repeated calls on the same snapshot', () => {
    const a = extractCandidates(snap);
    const b = extractCandidates(snap);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('is deterministic across attribute key insertion order', () => {
    const a = extractCandidates(snap);
    const b = extractCandidates(shuffled);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('extracts stable attributes, role and accessible name', () => {
    const candidates = extractCandidates(snap);
    const saveBtn = candidates.find((c) => c.attrs.id === 'save-btn');
    expect(saveBtn).toBeDefined();
    expect(saveBtn?.tag).toBe('BUTTON');
    expect(saveBtn?.role).toBe('button');
    expect(saveBtn?.accessibleName).toBe('Save changes');
  });

  it('resolves accessible name for a labelled input via label-for', () => {
    const candidates = extractCandidates(snap);
    const usernameInput = candidates.find((c) => c.attrs.id === 'username');
    expect(usernameInput?.accessibleName).toBe('Username');
  });
});
