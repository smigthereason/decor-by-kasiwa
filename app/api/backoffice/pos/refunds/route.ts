import { dbk109MaintenanceDecision, dbk109FreezeMessage } from '@/lib/db/dbk109-maintenance';
import { dbk109NeonAuthorityRequested } from '@/lib/db/dbk109-cutover-authority';
import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { processReturnRefund } from "@/lib/pos/operations";
import { dbk62CutoverRequested } from "@/lib/db/dbk62-pos-cutover";
import { dbk63RecordManualRefund } from '@/lib/db/dbk63-financial-neon';
import { isDbk62RealOrderId } from "@/lib/db/dbk62-pos-mapper";
import { dbk77LegacyFinanceEnabled, dbk77RequireSameOriginJson, dbk77ValidateLegacyRefund } from "@/lib/pos/dbk77-legacy-finance-core";
import { dbk108LegacyRefundsEnabled, dbk108RecordLegacyRefund } from "@/lib/db/dbk108-legacy-refunds-neon";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const maintenance = await dbk109MaintenanceDecision();
  if (maintenance !== 'OPEN') {
    return NextResponse.json({code:'DBK109_CUTOVER_FREEZE',retryable:false,
      message:dbk109FreezeMessage(maintenance)},
      {status:503,headers:{'Cache-Control':'private, no-store'}});
  }

  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    // A missing POS switch must never silently restore historical Sanity writes.
    if (dbk109NeonAuthorityRequested() && !dbk62CutoverRequested()) {
      return NextResponse.json({code:'NEON_ONLY_WRITES_REQUIRED',message:'Historical refund route is paused while Neon POS routing is incomplete.'},
        {status:503,headers:{'Cache-Control':'private, no-store'}});
    }
    const body = await request.json() as Parameters<typeof processReturnRefund>[0];
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role, storeLocationId: staff.storeLocationId, storeLocationName: staff.storeLocationName, storeLocationCode: staff.storeLocationCode };
    if (typeof body?.orderId === 'string' && isDbk62RealOrderId(body.orderId)) {
      if (!dbk62CutoverRequested()) return NextResponse.json({message:'Neon refund writes are disabled'},{status:503});
      if (request.headers.get('origin') !== new URL(request.url).origin ||
          !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({message:'Same-origin JSON request required for Neon financial operation'},{status:403});
      }
      return NextResponse.json(await dbk63RecordManualRefund(body,seller),
        {headers:{'Cache-Control':'private, no-store'}});
    }
    const legacyBridge = dbk77LegacyFinanceEnabled(dbk62CutoverRequested(),process.env.DBK77_LEGACY_FINANCE_BRIDGE);
    if (dbk62CutoverRequested() && !legacyBridge)
      return NextResponse.json({message:'Historical financial bridge is disabled'},{status:503});
    if (legacyBridge) {
      dbk77RequireSameOriginJson(request);
      dbk77ValidateLegacyRefund(body);
      if (dbk108LegacyRefundsEnabled()) {
        return NextResponse.json(await dbk108RecordLegacyRefund(body,seller),
          {headers:{'Cache-Control':'private, no-store'}});
      }
      if (process.env.DBK102_OPERATIONAL_NEON_ONLY === 'YES') {
        return NextResponse.json({message:'Historical Neon refund bridge not approved; no Sanity write attempted.'},{status:503});
      }
    }
    return NextResponse.json(await processReturnRefund(body, seller, legacyBridge));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to process return/refund." }, { status: 400 });
  }
}
