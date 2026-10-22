import { describe, expect, it } from 'vitest';
import { boundedText, graphemeLength } from './text-length.js';

describe('SETUP-01 text length', () => {
  it('counts an emoji or an accented letter as one character', () => {
    expect(graphemeLength('milk')).toBe(4);
    expect(graphemeLength('🍎🍌')).toBe(2);
    expect(graphemeLength('👨‍👩‍👧')).toBe(1);
    expect(graphemeLength('café')).toBe(4);
    expect(graphemeLength('café')).toBe(4);
  });

  it('bounds text by user-perceived characters', () => {
    const name = boundedText(1, 3);
    expect(name.safeParse('').success).toBe(false);
    expect(name.safeParse('🍎🍎🍎').success).toBe(true);
    expect(name.safeParse('abcd').success).toBe(false);
  });
});

describe('SETUP-01 shared exports', () => {
  it('exports the error schema and poll interval', async () => {
    const shared = await import('./index.js');
    expect(shared.POLL_INTERVAL_MS).toBe(5000);
    expect(
      shared.apiErrorSchema.safeParse({ error: { code: 'LIST_NOT_FOUND', message: 'List not found' } }).success,
    ).toBe(true);
    expect(shared.apiErrorSchema.safeParse({ error: { code: 'NOPE', message: '' } }).success).toBe(false);
  });
});
