/** Pure date arithmetic for Monday-first Nairobi business calendar display. */
export type CalendarDay = { date: string; day: number } | null;
export function calendarMonth(yyyyMm: string): { first: string; last: string; cells: CalendarDay[] } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyyMm)) throw new Error('Invalid calendar month');
  const year=Number(yyyyMm.slice(0,4)), month=Number(yyyyMm.slice(5,7));
  if (year<2000||year>2100) throw new Error('Calendar year out of range');
  const first=`${yyyyMm}-01`, lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const last=`${yyyyMm}-${String(lastDay).padStart(2,'0')}`;
  const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  const cells:CalendarDay[]=Array.from({length:offset},()=>null);
  for(let d=1;d<=lastDay;d++)cells.push({date:`${yyyyMm}-${String(d).padStart(2,'0')}`,day:d});
  while(cells.length%7)cells.push(null);
  return {first,last,cells};
}
export function shiftMonth(yyyyMm:string,offset:number):string {
  if(!Number.isSafeInteger(offset)||Math.abs(offset)>12)throw Error('Invalid shift');
  calendarMonth(yyyyMm);
  const y=Number(yyyyMm.slice(0,4)),m=Number(yyyyMm.slice(5,7));
  const date=new Date(Date.UTC(y,m-1+offset,1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}
