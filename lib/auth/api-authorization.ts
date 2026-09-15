import "server-only";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";

export type ApiStaffRole = "ADMIN" | "STORE" | "STORE_STAFF" | "PRODUCTION_STAFF" | "PACKAGING_STAFF" | "DELIVERY_STAFF";

export async function getApiStaff(
  allowedRoles: ApiStaffRole[],
): Promise<
  | {
      ok: true;
      role: ApiStaffRole;
      customerId: string;
      customerName: string;
      customerEmail: string;
    }
  | { ok: false; status: 401 | 403 }
> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { ok: false, status: 401 };
  }

  const customer = await getCustomerByDocumentId(session.user.id);

  if (!customer || customer.status !== "ACTIVE") {
    return { ok: false, status: 403 };
  }

  const staffRoles: ApiStaffRole[] = ["ADMIN", "STORE", "STORE_STAFF", "PRODUCTION_STAFF", "PACKAGING_STAFF", "DELIVERY_STAFF"];
  if (!staffRoles.includes(customer.role as ApiStaffRole)) {
    return { ok: false, status: 403 };
  }

  const role = customer.role as ApiStaffRole;
  if (!allowedRoles.includes(role)) {
    return { ok: false, status: 403 };
  }

  return {
    ok: true,
    role,
    customerId: customer._id,
    customerName: customer.name || customer.email || "Staff",
    customerEmail: customer.email,
  };
}
