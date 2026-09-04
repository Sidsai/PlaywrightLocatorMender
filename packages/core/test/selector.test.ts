import { describe, it, expect } from 'vitest';
import { parseSelector } from '../src/scoring/selector.js';

describe('parseSelector', () => {
  it('parses an id selector', () => {
    expect(parseSelector('#save-btn-RENAMED')).toMatchObject({ id: 'save-btn-RENAMED', classes: [] });
  });
  it('parses a tag+class selector', () => {
    expect(parseSelector('button.row-action')).toMatchObject({ tag: 'BUTTON', classes: ['row-action'] });
  });
  it('parses a structural selector down to its last segment', () => {
    expect(parseSelector('form > button:nth-of-type(1)')).toMatchObject({ tag: 'BUTTON' });
  });
  it('parses a text-engine selector', () => {
    expect(parseSelector('text="Save changes"')).toMatchObject({ text: 'Save changes' });
  });
  it('parses a data-testid attribute selector', () => {
    expect(parseSelector('[data-testid="save-btn"]')).toMatchObject({ testId: 'save-btn' });
  });
  it('never throws on an unrecognised or empty selector', () => {
    expect(() => parseSelector('')).not.toThrow();
    expect(() => parseSelector(':::garbage:::')).not.toThrow();
  });
});
