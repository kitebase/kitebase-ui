/**
 * Formatter registry — maps string names to Tabulator cell formatter functions.
 *
 * Resolution order for `formatter: name` in column YAML (see resolveFormatter):
 *   1. DATE_FORMATTERS  — built-in kitebase: date, datetime, time
 *                         (`datetime` shows hours and minutes; `datetime,second`
 *                         adds the seconds, as `granularity: second` does);
 *                         `codes`, the codes of a set (CodeSet) one after the other;
 *                         MEDIA_FORMATTERS (media.ts): media_image, media_file
 *   2. formatterRegistry — registered by plugins via formatters.ts files
 *   3. raw string       — passed to Tabulator as built-in formatter name
 *                         (e.g. "star", "progress", "tickCross", "color", ...)
 *
 * Shorthand params — `formatter: name,arg1,arg2` splits on commas:
 *   - Plugin formatters declare their own shorthand parser at registration.
 *   - Tabulator built-in formatters (star, progress) use TABULATOR_SHORTHAND below.
 *   - Unknown formatters fall back to generic { args: [...] }.
 */

import { MEDIA_FORMATTERS } from './media';

export type CellFormatter   = (cell: any, params: any, onRendered?: any) => string | HTMLElement;
export type ShorthandParser = (args: string[]) => Record<string, unknown>;

export interface FormatterResolution {
  formatter: CellFormatter | string;
  formatterParams?: Record<string, unknown>;
}

// ── Built-in date/time formatters ──────────────────────────────────────────
// Normalize "2024-03-15 10:30:00" (Python space separator) → ISO "T" before parsing.

function _parseDate(val: unknown): Date | null {
  if (val == null || val === '') return null;
  const s = typeof val === 'string' ? val.replace(' ', 'T') : String(val);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// A datetime is read to the minute: the seconds are there in the value, and
// shown only where a column asks for them (`granularity: second`), the same
// word the form's widget reads.
function _datetimeText(d: Date, granularity?: string): string {
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    ...(granularity === 'second' ? { second: '2-digit' } : {}),
  });
}

const DATE_FORMATTERS: Record<string, CellFormatter> = {
  date:     (cell) => { const d = _parseDate(cell.getValue()); return d ? d.toLocaleDateString()  : String(cell.getValue() ?? ''); },
  datetime: (cell, params) => { const d = _parseDate(cell.getValue()); return d ? _datetimeText(d, params?.granularity) : String(cell.getValue() ?? ''); },
  time:     (cell) => { const d = _parseDate(cell.getValue()); return d ? d.toLocaleTimeString()  : String(cell.getValue() ?? ''); },
};

// A set of codes arrives as a list: shown as the codes, comma separated, the
// way they are written. An escaped string, since Tabulator puts it in as HTML.
function _escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const SET_FORMATTERS: Record<string, CellFormatter> = {
  codes: (cell) => {
    const v = cell.getValue();
    return _escape(Array.isArray(v) ? v.join(', ') : String(v ?? ''));
  },
};

// ── Shorthand schemas for Tabulator built-in formatters ───────────────────
// `formatter: star,5`     → formatterParams: { stars: 5 }
// `formatter: progress,0,100` → formatterParams: { min: 0, max: 100 }

const TABULATOR_SHORTHAND: Record<string, ShorthandParser> = {
  star:     ([n])    => ({ stars: Number(n) }),
  progress: ([a, b]) => ({ min: Number(a ?? 0), max: Number(b ?? 100) }),
};

// ── Plugin registry ────────────────────────────────────────────────────────

interface FormatterEntry {
  fn:        CellFormatter;
  shorthand?: ShorthandParser;
}

const _registry = new Map<string, FormatterEntry>();

export const formatterRegistry = {
  register(name: string, fn: CellFormatter, opts?: { shorthand?: ShorthandParser }): void {
    _registry.set(name, { fn, shorthand: opts?.shorthand });
  },
  get(name: string): CellFormatter | undefined {
    return _registry.get(name)?.fn;
  },
  getShorthand(name: string): ShorthandParser | undefined {
    return _registry.get(name)?.shorthand;
  },
};

// ── Unified formatter resolution ───────────────────────────────────────────
// Resolves a raw formatter string (from YAML) to a Tabulator-compatible
// formatter + optional formatterParams.
//
// rawFmt examples:
//   "date"          → built-in date formatter function
//   "star,5"        → Tabulator "star" with { stars: 5 }
//   "my_fmt,a,b"    → plugin formatter with shorthand-derived params
//   "tickCross"     → Tabulator built-in string (passed through as-is)
//
// explicitParams (from column YAML `formatterParams:`) always wins over
// shorthand-derived params.

export function resolveFormatter(
  rawFmt: string,
  explicitParams?: Record<string, unknown>,
): FormatterResolution {
  const commaIdx = rawFmt.indexOf(',');
  const name     = commaIdx === -1 ? rawFmt : rawFmt.slice(0, commaIdx).trim();
  const args     = commaIdx === -1 ? [] : rawFmt.slice(commaIdx + 1).split(',').map(s => s.trim());

  // 1. Built-in formatters: dates, sets and media
  const mediaFmt = MEDIA_FORMATTERS[name] ?? SET_FORMATTERS[name];
  if (mediaFmt) return { formatter: mediaFmt, formatterParams: explicitParams };
  const dateFmt = DATE_FORMATTERS[name];
  if (dateFmt) {
    return { formatter: dateFmt,
             formatterParams: explicitParams ?? (args[0] ? { granularity: args[0] } : undefined) };
  }

  // 2. Plugin registry
  const pluginFmt = formatterRegistry.get(name);
  if (pluginFmt) {
    const shorthandParams = args.length > 0 ? (formatterRegistry.getShorthand(name)?.(args) ?? { args }) : undefined;
    return {
      formatter: pluginFmt,
      formatterParams: explicitParams ?? shorthandParams,
    };
  }

  // 3. Tabulator built-in (pass name as string)
  const shorthandParams = args.length > 0
    ? (TABULATOR_SHORTHAND[name]?.(args) ?? { args })
    : undefined;
  return {
    formatter: name,
    formatterParams: explicitParams ?? shorthandParams,
  };
}
