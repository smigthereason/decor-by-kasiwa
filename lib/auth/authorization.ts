import "server-only";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import {
  getCustomerByDocumentId,
  type CustomerRole,
  type SanityCustomer,
} from "@/lib/auth/sanity-users";

type StaffSurface = "ADMIN" | "STORE";

type StaffAccess = {
  customer: SanityCustomer;
  role: CustomerRole;
};

const permissions: Record<StaffSurface, CustomerRole[]> = {
  ADMIN: ["ADMIN"],

  STORE: ["ADMIN", "STORE"],
};

function loginUrl(nextPath: string) {
  return `/account/login?next=${encodeURIComponent(nextPath)}`;
}

export async function requireStaffAccess(
  surface: StaffSurface,
  nextPath: string,
): Promise<StaffAccess> {
  /*
   * 1. Verify there is a real authenticated session.
   */
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect(loginUrl(nextPath));
  }

  /*
   * 2. Never rely only on the JWT role.
   *
   * Read the current Sanity customer record so that:
   *
   * CUSTOMER -> ADMIN promotion
   * ADMIN -> CUSTOMER demotion
   * account suspension
   *
   * are respected by the protected application.
   */
  const customer = await getCustomerByDocumentId(session.user.id);

  if (!customer) {
    redirect("/account/access-denied?reason=account");
  }

  /*
   * 3. Suspended users cannot use business surfaces.
   */
  if (customer.status !== "ACTIVE") {
    redirect("/account/access-denied?reason=suspended");
  }

  /*
   * 4. Check the actual role against the requested surface.
   */
  const allowedRoles = permissions[surface];

  if (!allowedRoles.includes(customer.role)) {
    redirect(
      `/account/access-denied?reason=role&surface=${surface.toLowerCase()}`,
    );
  }

  return {
    customer,
    role: customer.role,
  };
}
