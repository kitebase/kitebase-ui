/**
 * Numbers in a form: how they are typed, shown, and how much room they take.
 *
 * Typed bare, without thousands separators, so the point and the comma can
 * both be the decimal separator: `12,5` and `12.5` are the same number, from
 * the main keyboard or the keypad. Shown in the browser's language, as the
 * dates are, rounded to the column's `scale`.
 *
 * Plain functions over values, so they are tested without a component.
 */

export interface NumberShape {
  /** Digits after the decimal separator; 0 for an integer. */
  scale: number;
  /** All the digits, when the column says; the width is reckoned from it. */
  precision?: number;
  /** At least this many decimals on show: a price reads 12.50, not 12.5. */
  minDecimals: number;
}

const INTEGER_TYPES = new Set(['integer', 'int', 'biginteger', 'smallinteger', 'id']);

/** What a field's column says about its numbers. */
export function numberShape(field: {
  type?: unknown; base?: unknown; scale?: unknown; precision?: unknown; widget?: unknown;
}): NumberShape {
  const kinds = [field.type, field.base].map((t) => String(t ?? '').toLowerCase());
  const integer = kinds.some((k) => INTEGER_TYPES.has(k));
  const scale = integer ? 0 : (typeof field.scale === 'number' ? field.scale : 4);
  const precision = typeof field.precision === 'number' ? field.precision : undefined;
  // Money is read with its cents; a quantity or a percentage only with what it has
  const minDecimals = field.widget === 'currency' ? Math.min(2, scale) : 0;
  return { scale, precision, minDecimals };
}

/**
 * The number in what was typed, or null for nothing typed, or NaN for what is
 * not a number. One separator at most, and it is the decimal one.
 */
export function parseNumber(text: string): number | null {
  const s = text.trim().replace(/\s/g, '');
  if (s === '') return null;
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}

/** Keep only what can make a number while it is typed: digits, one sign, separators. */
export function typeable(text: string, integer: boolean): string {
  return text.replace(integer ? /[^\d-]/g : /[^\d.,-]/g, '');
}

/** Rounded to the scale, as the database will keep it. */
export function roundTo(n: number, scale: number): number {
  const f = 10 ** scale;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** For reading: the language's separators, thousands grouped. */
export function formatNumber(n: number | null | undefined, shape: NumberShape,
                             locale?: string): string {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString(locale, {
    minimumFractionDigits: shape.minDecimals,
    maximumFractionDigits: shape.scale,
  });
}

/** For typing: no grouping, the language's decimal separator, every decimal there is. */
export function editText(n: number | null | undefined, shape: NumberShape,
                         locale?: string): string {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString(locale, {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: shape.scale,
  });
}

/**
 * The room a number needs, in `ch`, when the form gives it none: its digits,
 * the separators that come with them, a sign, and the padding of the box.
 * Without a precision, a dozen digits.
 */
export function numberWidthCh(shape: NumberShape): number {
  const digits = shape.precision ?? 12;
  const whole = Math.max(1, digits - shape.scale);
  const chars = digits + Math.floor((whole - 1) / 3) + (shape.scale > 0 ? 1 : 0) + 1;
  return Math.min(24, Math.max(8, chars + 3));
}
