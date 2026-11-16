/**
 * kanban.ts: the board of a view, as plain functions over its rows.
 *
 * The columns come from the table's state (kitebase/state.py), never from the
 * rows: a column with nothing in it still shows, and it is where a card is
 * dropped. A row whose state is none of them, or empty, goes to a column of
 * its own at the end, so nothing loaded is hidden.
 */

/** A column of the board: a value of the state column, and how it is named. */
export interface BoardValue {
  value: unknown;
  label: string;
  folded?: boolean;
}

export interface BoardColumn extends BoardValue {
  /** The value as a key (valueKey). */
  key: string;
  rows: Record<string, unknown>[];
  sum: number | null;
  /** False for the column of the rows that match no value: nothing is dropped there. */
  droppable: boolean;
}

/** The value as a key: 3 and "3" are the same stage, from a form or a query. */
export function valueKey(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * The rows under each value, in the order of the values, and their total on
 * `sumField` (null without one). Rows keep the order they come in.
 */
export function boardColumns(values: BoardValue[], rows: Record<string, unknown>[],
                             stateField: string, sumField?: string,
                             otherLabel = 'Other'): BoardColumn[] {
  const columns: BoardColumn[] = values.map((v) => ({
    ...v, key: valueKey(v.value), rows: [], sum: sumField ? 0 : null, droppable: true,
  }));
  const byKey = new Map(columns.map((c) => [c.key, c]));
  let other: BoardColumn | null = null;
  for (const row of rows) {
    let column = byKey.get(valueKey(row[stateField]));
    if (!column) {
      other ??= { value: null, label: otherLabel, key: '\u0000other', rows: [],
                  sum: sumField ? 0 : null, droppable: false };
      column = other;
    }
    column.rows.push(row);
    if (sumField) {
      const n = Number(row[sumField]);
      if (Number.isFinite(n)) column.sum = (column.sum ?? 0) + n;
    }
  }
  return other ? [...columns, other] : columns;
}
