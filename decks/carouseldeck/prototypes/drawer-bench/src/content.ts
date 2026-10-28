// THROWAWAY (#233). Content and snap points every bench drawer shares, so
// a difference in the numbers is the mechanics, not the markup: the same
// 50-row list, and the same snap fractions of the viewport height -- half
// at 50%, full at 92% -- passed to vaul's and Base UI's own `snapPoints`
// prop (both read a 0-1 number as "fraction of the viewport height", so
// the same two numbers mean the same thing to both) and used directly as
// drawerdeck's own `scroller.clientHeight * fraction` snap offsets.

export const ROWS = 50;
export const HALF_FRACTION = 0.5;
export const FULL_FRACTION = 0.92;

export function buildRows(n: number): string {
  let html = '';
  for (let i = 1; i <= n; i++) {
    html += `<div class="bench-row">Row ${i}</div>`;
  }
  return html;
}

export function RowsReact(n: number) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push(i);
  }
  return rows;
}
