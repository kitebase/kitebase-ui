/**
 * Shared types for KitebaseTable and DataTable.svelte.
 */

export interface ColumnDef {
  field: string;
  title?: string;
  width?: number | string;
  minWidth?: number;
  maxWidth?: number;
  frozen?: boolean;
  hozAlign?: 'left' | 'center' | 'right';
  formatter?: string | ((cell: any, params: any) => string | HTMLElement);
  formatterParams?: Record<string, unknown>;
  sorter?: string;
  visible?: boolean;
  headerSort?: boolean;
  cssClass?: string;
}

export interface SortDef {
  field: string;
  dir: 'asc' | 'desc';
}

export interface CellInfo {
  field: string;
  value: unknown;
  row: any;
}

export interface KitebaseTableConfig {
  data: any[];
  columns: ColumnDef[];
  selectable: boolean;
  filterMode: boolean;
  mode: 'virtual' | 'page';
  pageSize: number;
  rowHeight?: number;
  initialSort: SortDef[];
  treeMode: boolean;
  treeChildField: string;
  treeStartExpanded: boolean;
  /**
   * The tones of a row (components/tone.ts): `kb-tone-<tone>` on the toned
   * cells, `kb-tone-muted` on a muted row.
   */
  rowTones?: (row: any) => { cells: Record<string, string>; muted: boolean };
  onRowClick?: (row: any) => void;
  onRowDblClick?: (row: any) => void;
  onCellClick?: (cell: CellInfo) => void;
  onSelectionChange?: (rows: any[]) => void;
  onDataLoaded?: (count: number) => void;
  onFiltered?: (count: number) => void;
  onSorted?: () => void;
  onReady?: () => void;
  /**
   * The rows can be moved: the order is the data's (a declared sequence), not
   * the grid's. Moving happens in reorder mode only (`setReorder`): the handle
   * shows, Alt+Up / Alt+Down work, and the columns do not sort, so a row moved
   * always has a place to stay. The grid tells the new order, or the move
   * asked from the keyboard, and the owner of the rows decides.
   */
  movableRows?: boolean;
  onRowsMoved?: (ids: unknown[]) => void;
  onRowMoveKey?: (id: unknown, delta: -1 | 1) => void;
  // Navigator action callbacks — fired by keyboard shortcuts
  onNavAdd?: () => void;
  onNavEdit?: () => void;
  onNavDelete?: () => void;
  onNavCommands?: () => void;
  onNavRefresh?: () => void;
  onNavExport?: () => void;
  onNavPrint?: () => void;
  onNavCancel?: () => void;
}
