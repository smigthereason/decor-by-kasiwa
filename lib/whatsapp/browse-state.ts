import 'server-only';
import { getNeonSql } from '@/lib/db/neon';

export type BrowseState = {mode:'categories'|'products'; category:string|null; query:string|null; page:number};

/** A 30-minute session. WhatsApp messages remain stored independently. */
export async function getBrowseState(waId:string):Promise<BrowseState|null> {
  const sql=getNeonSql();
  const rows=await sql`SELECT mode,category,query,page FROM public.dbk36_wa_browse_states
    WHERE wa_id=${waId} AND updated_at>now()-interval '30 minutes' LIMIT 1`;
  const row=rows[0];
  if (!row || (row.mode!=='categories' && row.mode!=='products')) return null;
  return {mode:row.mode as BrowseState['mode'],category:row.category as string|null,
    query:row.query as string|null,page:Number(row.page)||0};
}

export async function saveBrowseState(waId:string,state:BrowseState):Promise<void> {
  const sql=getNeonSql();
  await sql`INSERT INTO public.dbk36_wa_browse_states (wa_id,mode,category,query,page,updated_at)
    VALUES (${waId},${state.mode},${state.category},${state.query},${state.page},now())
    ON CONFLICT (wa_id) DO UPDATE SET mode=EXCLUDED.mode,category=EXCLUDED.category,
      query=EXCLUDED.query,page=EXCLUDED.page,updated_at=now()`;
}

export async function clearBrowseState(waId:string):Promise<void> {
  const sql=getNeonSql();
  await sql`DELETE FROM public.dbk36_wa_browse_states WHERE wa_id=${waId}`;
}
