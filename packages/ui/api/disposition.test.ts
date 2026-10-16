import { describe, it, expect } from 'vitest';
import { filenameOf } from './disposition';

describe('filenameOf', () => {
  it('prefers the UTF-8 name', () => {
    expect(filenameOf(`attachment; filename="citt_.csv"; filename*=UTF-8''citt%C3%A0.csv`))
      .toBe('città.csv');
  });

  it('falls back to the ASCII name', () => {
    expect(filenameOf('attachment; filename="book_20261016.xlsx"')).toBe('book_20261016.xlsx');
  });

  it('falls back when the UTF-8 name is malformed', () => {
    expect(filenameOf(`inline; filename="a.pdf"; filename*=UTF-8''%E0%A4%A`)).toBe('a.pdf');
  });

  it('is null without a name', () => {
    expect(filenameOf('attachment')).toBeNull();
    expect(filenameOf('')).toBeNull();
  });
});
