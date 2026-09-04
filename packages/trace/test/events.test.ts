import { describe, it, expect } from 'vitest';
import { getStr } from '../src/events.js';

describe('getStr', () => {
  it('never throws on malformed events', () => {
    expect(getStr({}, 'a', 'b')).toBeUndefined();
    expect(getStr({ a: null }, 'a', 'b')).toBeUndefined();
    expect(getStr({ a: { b: 42 } }, 'a', 'b')).toBeUndefined();
    expect(getStr({ a: { b: 'x' } }, 'a', 'b')).toBe('x');
  });
});
