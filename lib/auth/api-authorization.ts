import "server-only";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";

export type ApiStaffRole = "ADMIN" | "STORE";

export async function getApiStaff(
  allowedRoles: ApiStaffRole[],
): Promise<
  | { ok: true; role: ApiStaffRole; customerId: string }
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

  if (customer.role !== "ADMIN" && customer.role !== "STORE") {
    return { ok: false, status: 403 };
  }

  if (!allowedRoles.includes(customer.role)) {
    return { ok: false, status: 403 };
  }

  return {
    ok: true,
    role: customer.role,
    customerId: customer._id,
  };
}
