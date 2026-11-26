import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseReportDates, expenseReportWindow, expenseLedgerOptions, filterExpenses } from '../lib/pos/dbk153-expenditure-core.ts';

test('Kenyan date boundaries include every instant of the chosen day', () => {
  assert.deepEqual(expenseReportWindow('2026-11-26','2026-11-26'), {start:'2026-11-25T21:00:00.000Z', endExclusive:'2026-11-26T21:00:00.000Z'});
  assert.deepEqual(expenseReportWindow('2026-12-31','2026-12-31'), {start:'2026-12-30T21:00:00.000Z',endExclusive:'2026-12-31T21:00:00.000Z'});
});
test('invalid dates and reversed ranges rejected', () => {
  for (const [from,to] of [['','2026-11-26'],['2026-02-30','2026-03-01'],['2026-11-27','2026-11-26'],['2026-1-1','2026-11-26']]) assert.throws(()=>expenseReportWindow(from,to));
});
test('default month follows Nairobi date, not UTC date', () => {
  assert.deepEqual(expenseReportDates(new Date('2026-10-31T21:01:00Z')), {from:'2026-11-01',to:'2026-11-01'});
});
const records = [{expenseType:'EXPENSE',ledgerAccount:'Rent',amount:100.10},{expenseType:'SALARY',ledgerAccount:'Salaries',amount:500},{expenseType:'PETTY_CASH',ledgerAccount:' rent ',amount:30.20},{expenseType:'EXPENSE',ledgerAccount:'Electricity',amount:99}];
test('expense type and ledger filters combine and totals match', () => {
  assert.deepEqual(filterExpenses(records,'EXPENSE','rent'),{rows:[records[0]],total:100.1});
  assert.equal(filterExpenses(records,'','RENT').total,130.3);
  assert.equal(filterExpenses(records,'SALARY','rent').rows.length,0);
  assert.equal(filterExpenses(records,'','').total,729.3);
});
test('ledger options normalize capitalization and whitespace', () => {
  assert.deepEqual(expenseLedgerOptions(records),[{value:'electricity',label:'Electricity'},{value:'rent',label:'Rent'},{value:'salaries',label:'Salaries'}]);
});
test('filters do not truncate history at 150 records', () => {
  const rows = Array.from({length:501},(_,i)=>({...records[0],id:i}));
  assert.equal(filterExpenses(rows,'EXPENSE','Rent').rows.length,501);
});
