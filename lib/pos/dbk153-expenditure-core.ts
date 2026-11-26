/** Expenditure report uses Kenyan business dates, independent of browser timezone. */
export const EXPENSE_TYPES = [
  { value: 'EXPENSE', label: 'Business expense' },
  { value: 'PETTY_CASH', label: 'Petty cash' },
  { value: 'STAFF_PAYMENT', label: 'Staff payment' },
  { value: 'SALARY', label: 'Salary' },
] as const;

export function expenseReportDates(now = new Date()) {
  const to = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function expenseReportWindow(from: string, to: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Select valid From and To dates.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Select valid From and To dates.');
    return date.getTime();
  };
  const first = parse(from), last = parse(to);
  if (first > last) throw new Error('From date cannot be after To date.');
  return { start: new Date(first - 3 * 3600000).toISOString(), endExclusive: new Date(last + 21 * 3600000).toISOString() };
}

export function expenseLedgerKey(value: string) { return value.trim().toLowerCase(); }

export function expenseLedgerOptions(rows: readonly { ledgerAccount: string }[]) {
  const labels = new Map<string, string>();
  for (const row of rows) {
    const label = row.ledgerAccount.trim();
    const key = expenseLedgerKey(label);
    if (key && !labels.has(key)) labels.set(key, label);
  }
  return [...labels].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'en-KE'));
}

export function filterExpenses<T extends { expenseType: string; ledgerAccount: string; amount: number }>(rows: readonly T[], type: string, ledger: string) {
  const filtered = rows.filter(row => (!type || row.expenseType === type) && (!ledger || expenseLedgerKey(row.ledgerAccount) === expenseLedgerKey(ledger)));
  // Sum monetary values in cents rather than accumulating decimal rounding error.
  const total = filtered.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  return { rows: filtered, total };
}
