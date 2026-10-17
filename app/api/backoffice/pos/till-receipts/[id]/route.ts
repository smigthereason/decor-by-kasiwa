import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";
export const dynamic = "force-dynamic";
const clean = (x: unknown) => typeof x === "string" ? x.trim() : "";
export async function PATCH(request: Request, context: {params: Promise<{id:string}>}) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({message:"Access denied"},{status:staff.status});
  const {id} = await context.params;
  const record = await serverClient.fetch<{_id:string;status:string;amount:number;receipt:string;verificationStatus?:string;storeId?:string;orderId?:string}|null>(`*[_type == "tillReceipt" && _id == $id][0]{_id,status,amount,receipt,verificationStatus,"storeId":storeLocation._ref,"orderId":order._ref}`,{id});
  if (!record) return NextResponse.json({message:"Receipt not found"},{status:404});
  if (staff.role === "MANAGER" && (!staff.storeLocationId || record.storeId !== staff.storeLocationId)) return NextResponse.json({message:"Not assigned to this store"},{status:403});
  const input = await request.json().catch(()=>({}));
  const action = clean(input.action);
  if (record.status === "reconciled") return NextResponse.json({message:"Already reconciled; changes require a separate audited adjustment"},{status:409});
  const now = new Date().toISOString();
  if (action === "match") {
    const orderId = clean(input.orderId);
    const order = await serverClient.fetch<{_id:string;total:number;storeId?:string;paymentStatus?:string}|null>(`*[_type == "commerceOrder" && _id == $id][0]{_id,total,paymentStatus,"storeId":storeLocation._ref}`,{id:orderId});
    if (!order || Math.abs(Number(order.total)-record.amount) > 0.01) return NextResponse.json({message:"Order not found or amount differs; review manually"},{status:400});
    if (record.storeId && order.storeId && record.storeId !== order.storeId) return NextResponse.json({message:"Order belongs to another store"},{status:403});
    if (staff.role === "MANAGER" && order.storeId !== staff.storeLocationId) return NextResponse.json({message:"Cannot match another store's order"},{status:403});
    const linked = await serverClient.fetch<number>(`count(*[_type == "tillReceipt" && _id != $id && order._ref == $orderId && status in ["matched","reconciled"]])`,{id,orderId});
    if (linked) return NextResponse.json({message:"Order already linked to another Till receipt"},{status:409});
    await serverClient.patch(id).set({order:{_type:"reference",_ref:orderId},status:"matched",updatedAt:now}).commit();
  } else if (action === "reviewEvidence") {
    if (staff.role !== "ADMIN" && staff.role !== "STORE") return NextResponse.json({message:"Only Admin or Store Manager can review provider evidence"},{status:403});
    const evidence = clean(input.evidence).slice(0,200);
    if (evidence.length < 8) return NextResponse.json({message:"Enter a verifiable statement/provider evidence reference"},{status:400});
    await serverClient.patch(id).set({verificationStatus:"evidence_reviewed",evidenceReference:evidence,updatedAt:now}).commit();
  } else if (action === "reconcile") {
    if (staff.role !== "ADMIN" && staff.role !== "STORE") return NextResponse.json({message:"Only Admin or Store Manager may reconcile"},{status:403});
    if (record.status !== "matched" || record.verificationStatus !== "evidence_reviewed" || !record.orderId) return NextResponse.json({message:"Match an order and review provider evidence first"},{status:400});
    const duplicate = await serverClient.fetch<number>(`count(*[(_type == "paymentTransaction" && providerReceiptNumber == $receipt) || (_type == "commerceOrder" && (providerReceiptNumber == $receipt || manualPaymentReference == $receipt))])`,{receipt:record.receipt});
    if (duplicate) return NextResponse.json({message:"Receipt already used by another transaction"},{status:409});
    await serverClient.patch(id).set({status:"reconciled",updatedAt:now}).commit();
    // Intentionally does not settle an order or deduct inventory: provider statement review is not an API verification.
  } else return NextResponse.json({message:"Invalid action"},{status:400});
  return NextResponse.json({ok:true});
}
