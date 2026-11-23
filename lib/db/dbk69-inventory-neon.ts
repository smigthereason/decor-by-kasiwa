import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import type { Dbk69Balance } from './dbk69-inventory-core';

export const dbk69InventoryEnabled = () => process.env.DBK_INVENTORY_BACKEND === 'neon';
export function requirePinnedInventoryDatabase() {
  const expected = process.env.DBK69_EXPECTED_NEON_HOST;
  const configured = process.env.DATABASE_URL;
  if (!expected || !configured) throw new Error('DBK-69 database pin missing');
  const u = new URL(configured);
  const host = u.hostname;
  const productionHost = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
  if (!['postgres:','postgresql:'].includes(u.protocol) ||
      host !== productionHost || expected !== productionHost ||
      decodeURIComponent(u.pathname.slice(1)) !== 'neondb') {
    throw new Error('DBK-69 database host mismatch: refusing inventory operation');
  }
}


export async function dbk69AllBalances(): Promise<Dbk69Balance[]> {
  if (!dbk69InventoryEnabled()) throw new Error('Neon inventory read switch disabled');
  requirePinnedInventoryDatabase();
  const rows = await getNeonSql()`
    SELECT product_id,variant_id,location_id,on_hand,incoming
    FROM public.dbk51_stock_balances ORDER BY product_id,variant_id,location_id LIMIT 200001
  `;
  if (!rows.length || rows.length > 200000) throw new Error('Neon stock unseeded or exceeds safe read limit');
  return rows as unknown as Dbk69Balance[];
}

export async function dbk69ProductBalances(productId:string): Promise<Dbk69Balance[]> {
  if (!dbk69InventoryEnabled()) throw new Error('Neon inventory read switch disabled');
  requirePinnedInventoryDatabase();
  const rows = await getNeonSql()`SELECT product_id,variant_id,location_id,on_hand,incoming
    FROM public.dbk51_stock_balances WHERE product_id=${productId}`;
  if (!rows.length) throw new Error('Product missing from Neon stock seed');
  return rows as unknown as Dbk69Balance[];
}

export type Dbk69AdminOperation = {
  operationId: string;
  type: 'PURCHASE'|'RECEIVE'|'TRANSFER';
  productId: string;
  variantId?: string;
  quantity: number;
  sourceStoreId?: string;
  destinationStoreId: string;
  actorId: string;
  actorName: string;
  productName: string;
  variantLabel?: string;
  destinationName: string;
  sourceName?: string;
  note?: string;
  unitCost: number;
};

export async function dbk69ApplyAdminOperation(input: Dbk69AdminOperation) {
  if (!dbk69InventoryEnabled() || process.env.DBK69_INVENTORY_ADMIN !== 'enabled') {
    throw new Error('Neon inventory administration has not been approved');
  }
  if (!/^dbk69-[0-9a-f-]{36}$/i.test(input.operationId) ||
      !Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 1000000000 ||
      !input.productId || !input.destinationStoreId ||
      !['PURCHASE','RECEIVE','TRANSFER'].includes(input.type) ||
      !Number.isFinite(input.unitCost) || input.unitCost < 0 ||
      !input.actorId || !input.actorName || !input.productName ||
      (input.note || '').length > 500 ||
      (input.type === 'TRANSFER' && (!input.sourceStoreId || input.sourceStoreId === input.destinationStoreId))) {
    throw new Error('Invalid Neon inventory operation');
  }
  requirePinnedInventoryDatabase();
  const payload = {
    type:input.type,
    productId:input.productId,
    variantId:input.variantId || '',
    quantity:input.quantity,
    ...(input.type === 'TRANSFER' ? {sourceStoreId:input.sourceStoreId} : {}),
    destinationStoreId:input.destinationStoreId,
  };
  const meta = {
    actorId:input.actorId,actorName:input.actorName,
    productName:input.productName,variantLabel:input.variantLabel || '',
    sourceName:input.sourceName || '',destinationName:input.destinationName,
    unitCost:Number(input.unitCost.toFixed(2)),note:input.note || '',
  };
  const rows = await getNeonSql()`
    SELECT public.dbk69_apply_inventory(
      ${input.operationId},${JSON.stringify(payload)}::jsonb,${JSON.stringify(meta)}::jsonb
    ) AS result
  `;
  if (!rows[0]?.result) throw new Error('Neon inventory operation did not return a result');
  return rows[0].result as Record<string,unknown>;
}

// DBK-125: Separate immutable audit ledger; never rewrite DBK-51/69 original operations.
// Disabled by default until migration and staged stock reconciliation pass.
export function dbk125CorrectionsEnabled() {
  return dbk69InventoryEnabled() && process.env.DBK125_NEON_CORRECTIONS_ENABLED === 'YES';
}

export async function dbk125CorrectMovement(input: {
  operationId:string;correctionId:string;expectedQuantity:number;
  quantity:number;reason:string;actorId:string;actorName:string;role:'ADMIN'|'STORE';
}) {
  if (!dbk125CorrectionsEnabled() || process.env.DBK69_INVENTORY_ADMIN !== 'enabled') {
    throw new Error('DBK125_WRITE_GATE_OFF');
  }
  if (!/^dbk69-[0-9a-f-]{36}$/i.test(input.operationId) ||
      !/^dbk125-[0-9a-f-]{36}$/i.test(input.correctionId) ||
      !Number.isSafeInteger(input.expectedQuantity) || input.expectedQuantity<=0 ||
      !Number.isSafeInteger(input.quantity) || input.quantity<0 || input.quantity>1000000000 ||
      input.expectedQuantity===input.quantity ||
      input.reason.trim().length<5 || input.reason.trim().length>500 ||
      !input.actorId || !input.actorName || !['ADMIN','STORE'].includes(input.role)) {
    throw new Error('DBK125_INVALID_CORRECTION');
  }
  requirePinnedInventoryDatabase();
  const rows=await getNeonSql()`SELECT public.dbk125_correct_inventory(
    ${input.correctionId},${input.operationId},${input.expectedQuantity}::bigint,
    ${input.quantity}::bigint,${input.reason.trim()},${input.actorId},${input.actorName},${input.role}
  ) AS result`;
  if (!rows[0]?.result) throw new Error('DBK125_NO_RESULT');
  return rows[0].result as Record<string,unknown>;
}

export type Dbk69MovementFilter = {q:string;from:string;to:string;type:string;scope:string;limit:number};
export async function dbk69ListMovements(filters: Dbk69MovementFilter) {
  if (!dbk69InventoryEnabled()) throw new Error('Neon inventory read switch disabled');
  requirePinnedInventoryDatabase();
  const {q,from,to,type,scope,limit} = filters;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10051) throw new Error('Invalid movement page limit');
  // Keep history readable before DBK-125 migration and authorization gate are enabled.
  const rows = dbk125CorrectionsEnabled() ? await getNeonSql()`
    SELECT m.operation_id,m.request_payload,m.metadata,m.result_payload,m.quantity,
      m.movement_type,m.created_at,
      c.new_quantity AS corrected_quantity,c.created_at AS corrected_at,
      c.actor_name AS corrected_by,c.reason AS correction_reason,c.correction_kind
    FROM public.dbk69_inventory_movements m
    LEFT JOIN LATERAL (
      SELECT new_quantity,created_at,actor_name,reason,correction_kind
      FROM public.dbk125_movement_corrections
      WHERE original_operation_id=m.operation_id
      ORDER BY sequence_number DESC LIMIT 1
    ) c ON TRUE
    WHERE (${type}='' OR m.movement_type=CASE WHEN ${type}='RECEIPT' THEN 'RECEIVE' ELSE ${type} END)
      AND (${scope}='' OR m.request_payload->>'sourceStoreId'=${scope} OR m.request_payload->>'destinationStoreId'=${scope})
      AND (${q}='' OR LOWER(coalesce(m.metadata->>'productName','') || ' ' || coalesce(m.metadata->>'actorName','') || ' ' || coalesce(m.metadata->>'note','')) LIKE '%' || LOWER(${q}) || '%')
      AND (NULLIF(${from},'') IS NULL OR m.created_at >= NULLIF(${from},'')::timestamptz)
      AND (NULLIF(${to},'') IS NULL OR m.created_at < NULLIF(${to},'')::timestamptz)
    ORDER BY m.created_at DESC,m.operation_id DESC LIMIT ${limit}
  ` : await getNeonSql()`
    SELECT operation_id,request_payload,metadata,result_payload,quantity,movement_type,created_at
    FROM public.dbk69_inventory_movements
    WHERE (${type}='' OR movement_type=CASE WHEN ${type}='RECEIPT' THEN 'RECEIVE' ELSE ${type} END)
      AND (${scope}='' OR request_payload->>'sourceStoreId'=${scope} OR request_payload->>'destinationStoreId'=${scope})
      AND (${q}='' OR LOWER(coalesce(metadata->>'productName','') || ' ' || coalesce(metadata->>'actorName','') || ' ' || coalesce(metadata->>'note','')) LIKE '%' || LOWER(${q}) || '%')
      AND (NULLIF(${from},'') IS NULL OR created_at >= NULLIF(${from},'')::timestamptz)
      AND (NULLIF(${to},'') IS NULL OR created_at < NULLIF(${to},'')::timestamptz)
    ORDER BY created_at DESC,operation_id DESC LIMIT ${limit}
  `;
  return rows.map((row) => {
    const p=row.request_payload as Record<string,unknown>;
    const m=row.metadata as Record<string,unknown>;
    const result=row.result_payload as Record<string,unknown>;
    const qty=Number(row.quantity);
    return {
      _id:'dbk69.'+String(row.operation_id),
      movementNumber:String(row.operation_id),
      movementType:row.movement_type==='RECEIVE' ? 'RECEIPT' : row.movement_type,
      productName:String(m.productName || ''),variantId:String(p.variantId || ''),
      variantLabel:String(m.variantLabel || ''),
      quantityChange:row.movement_type==='TRANSFER' ? -qty : qty,
      correctedQuantity:row.corrected_quantity == null ? undefined : Number(row.corrected_quantity),
      correctedAt:row.corrected_at == null ? undefined : new Date(String(row.corrected_at)).toISOString(),
      correctedBy:row.corrected_by == null ? undefined : String(row.corrected_by),
      correctionReason:row.correction_reason == null ? undefined : String(row.correction_reason),
      voidedAt:row.correction_kind==='VOID' ? new Date(String(row.corrected_at)).toISOString() : undefined,
      stockAfter:Number(result.stockAfter || 0),incomingAfter:Number(result.incomingAfter || 0),
      sourceLocation:String(m.sourceName || ''),destination:String(m.destinationName || ''),
      sourceStoreId:String(p.sourceStoreId || ''),destinationStoreId:String(p.destinationStoreId || ''),
      unitCost:Number(m.unitCost || 0),movementValue:Number(m.unitCost || 0)*(row.corrected_quantity == null ? qty : Number(row.corrected_quantity)),
      actorName:String(m.actorName || ''),note:String(m.note || ''),createdAt:new Date(String(row.created_at)).toISOString(),
      // No _rev: legacy Sanity movement correction is deliberately unavailable on Neon.
    };
  });
}
