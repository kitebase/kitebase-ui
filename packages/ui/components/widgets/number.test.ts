import { describe, it, expect } from 'vitest';
import {
  numberShape, parseNumber, typeable, roundTo, formatNumber, editText, numberWidthCh,
} from './number';

const price = numberShape({ type: 'Price', base: 'Money', widget: 'currency', precision: 10, scale: 4 });
const percent = numberShape({ type: 'Percent', base: 'Numeric', widget: 'percent', precision: 5, scale: 2 });
const quantity = numberShape({ type: 'Quantity', base: 'Numeric', precision: 12, scale: 3 });
const count = numberShape({ type: 'Integer' });

describe('reading what was typed', () => {
  it('takes the point and the comma alike as the decimal separator', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber(' -3 ')).toBe(-3);
    expect(parseNumber(',5')).toBe(0.5);
  });

  it('tells nothing typed from what is not a number', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('1.234,5')).toBeNaN();     // grouping is for reading only
    expect(parseNumber('12a')).toBeNaN();
  });

  it('keeps only what can make a number while typing', () => {
    expect(typeable('1a2,5x', false)).toBe('12,5');
    expect(typeable('12,5', true)).toBe('125');
  });
});

describe('the shape of a column', () => {
  it('follows the type: integers have no decimals, money shows its cents', () => {
    expect(count).toMatchObject({ scale: 0, minDecimals: 0 });
    expect(price).toMatchObject({ scale: 4, minDecimals: 2 });
    expect(percent).toMatchObject({ scale: 2, minDecimals: 0 });
    expect(quantity).toMatchObject({ scale: 3, minDecimals: 0 });
  });
});

describe('showing and editing', () => {
  it('shows in the language, rounded to the scale, money with its cents', () => {
    expect(formatNumber(12.5, price, 'it-IT')).toBe('12,50');
    expect(formatNumber(12.4575, price, 'it-IT')).toBe('12,4575');
    expect(formatNumber(1234567.5, price, 'en-US')).toBe('1,234,567.50');
    expect(formatNumber(10, quantity, 'it-IT')).toBe('10');
    expect(formatNumber(15, percent, 'it-IT')).toBe('15');
    expect(formatNumber(null, price)).toBe('');
  });

  it('edits without grouping, with the language decimal separator', () => {
    expect(editText(1234.5, price, 'it-IT')).toBe('1234,5');
    expect(editText(1234.5, price, 'en-US')).toBe('1234.5');
  });

  it('rounds as the database keeps it', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(12.34567, 4)).toBe(12.3457);
  });
});

describe('the room a number takes', () => {
  it('grows with its digits, within bounds', () => {
    expect(numberWidthCh(percent)).toBeLessThan(numberWidthCh(price));
    expect(numberWidthCh(percent)).toBeGreaterThanOrEqual(8);
    expect(numberWidthCh(numberShape({ type: 'Numeric', precision: 30, scale: 2 }))).toBe(24);
  });
});
