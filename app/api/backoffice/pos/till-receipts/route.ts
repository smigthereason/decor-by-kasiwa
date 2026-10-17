import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";
export const dynamic = "force-dynamic";
const clean = (x: unknown) => typeof x === "string" ? x.trim() : "";
const ref = (id: string) => ({ _type: "reference" as const, _ref: id });
export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({message:"Access denied"},{status:staff.status});
  const selected = new URL(request.url).searchParams.get("store") || "";
  const storeId = staff.role === "MANAGER" ? staff.storeLocationId : selected;
  if (staff.role === "MANAGER" && !storeId) return NextResponse.json({message:"Manager needs an assigned store"},{status:403});
  const receipts = await serverClient.fetch(`*[_type == "tillReceipt" && ($store == "" || storeLocation._ref == $store)] | order(createdAt desc)[0...200]{_id,receipt,amount,payer,paidAt,status,verificationStatus,evidenceReference,notes,source,createdAt,"orderId":order._ref,"storeId":storeLocation._ref,"storeName":storeLocation->name}`,{store:storeId || ""},{cache:"no-store"});
  return NextResponse.json({receipts});
}
export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({message:"Access denied"},{status:staff.status});
  const data = await request.json().catch(()=>({}));
  const receipt = clean(data.receipt).toUpperCase();
  const amount = Number(data.amount);
  if (!/^[A-Z0-9]{8,20}$/.test(receipt) || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({message:"Valid M-Pesa receipt and positive amount required"},{status:400});
  const storeId = staff.role === "MANAGER" ? staff.storeLocationId : clean(data.storeId);
  if (staff.role === "MANAGER" && !storeId) return NextResponse.json({message:"Manager needs an assigned store"},{status:403});
  if (storeId) {
    const valid = await serverClient.fetch(`count(*[_type == "storeLocation" && _id == $id && active != false])`,{id:storeId});
    if (!valid) return NextResponse.json({message:"Invalid store"},{status:400});
  }
  const used = await serverClient.fetch(`count(*[(_type == "paymentTransaction" && providerReceiptNumber == $receipt) || (_type == "commerceOrder" && (providerReceiptNumber == $receipt || manualPaymentReference == $receipt))])`,{receipt});
  if (used) return NextResponse.json({message:"Receipt already used in an order/payment. Review existing record first."},{status:409});
  const id = `tillReceipt.${receipt}`;
  const now = new Date().toISOString();
  try {
    await serverClient.createIfNotExists({_id:id,_type:"tillReceipt",receipt,amount,payer:clean(data.payer).slice(0,120),paidAt:clean(data.paidAt) || undefined,source:"manual_unverified",status:"unmatched",verificationStatus:"unverified",notes:clean(data.notes).slice(0,1000),...(storeId?{storeLocation:ref(storeId)}:{}),processedBy:ref(staff.customerId),createdAt:now,updatedAt:now});
    return NextResponse.json({id},{status:201});
  } catch (error) {console.error("[Till reconciliation] intake failed",error);return NextResponse.json({message:"Unable to record Till receipt"},{status:500});}
}
