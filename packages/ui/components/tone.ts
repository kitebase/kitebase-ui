/**
 * The tone of a value: a column's value mapped onto a closed list of tones.
 *
 * Declared on the column whose value it reads, read by every renderer: a grid
 * colours that cell, a card the ribbon showing that column. `muted` is the
 * one tone of the whole row: a value muted on any column greys the record out
 * (a book nobody can borrow). The tones are names, never colours: each
 * renderer draws them with the `--kb-*` tokens, so a theme changes them all.
 *
 *   - field: status
 *     tone: { values: { A: success, N: muted } }       # exact values
 *   - field: rating
 *     tone: { ranges: [[4, success], [3, warning], [1, danger]] }
 *
 * `values` is looked up first; `ranges` gives a number the tone of the
 * highest minimum it reaches. A value neither names has no tone.
 */

export const TONES = ['accent', 'success', 'warning', 'danger', 'muted'] as const;
export type Tone = (typeof TONES)[number];

export interface ColumnTone {
  /** Value, as text, to tone. */
  values?: Record<string, string>;
  /** [minimum, tone] pairs, in any order. */
  ranges?: Array<[number, string]>;
}

export function isTone(value: unknown): value is Tone {
  return typeof value === 'string' && (TONES as readonly string[]).includes(value);
}

/** The tone of one value, or null. */
export function toneOf(tone: ColumnTone | undefined, value: unknown): Tone | null {
  if (!tone || value === null || value === undefined || value === '') return null;
  const named = tone.values?.[String(value)];
  if (named !== undefined) return isTone(named) ? named : null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!tone.ranges || !Number.isFinite(n)) return null;
  let best: [number, string] | null = null;
  for (const range of tone.ranges) {
    if (!Array.isArray(range) || typeof range[0] !== 'number') continue;
    if (n >= range[0] && (best === null || range[0] > best[0])) best = range;
  }
  return best && isTone(best[1]) ? best[1] : null;
}

/** What a row looks like: the tone of each toned column, and whether it is muted. */
export interface RowTones {
  cells: Record<string, Tone>;
  muted: boolean;
}

/** The tones of a row, from the toned columns of a view (key to tone). */
export function rowTones(tones: Record<string, ColumnTone>, row: Record<string, unknown>): RowTones {
  const cells: Record<string, Tone> = {};
  let muted = false;
  for (const [key, tone] of Object.entries(tones)) {
    const t = toneOf(tone, row[key]);
    if (t === null) continue;
    if (t === 'muted') muted = true;
    else cells[key] = t;
  }
  return { cells, muted };
}
