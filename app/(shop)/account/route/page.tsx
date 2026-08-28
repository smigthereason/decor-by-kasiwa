import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import {
  getRoleHomePath,
  getSafeCustomerNextPath,
} from "@/lib/auth/role-routing";
import { getCustomerByDocumentId } from "@/lib/auth/sanity-users";

export const dynamic = "force-dynamic";

type AccountRoleRouterPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function AccountRoleRouterPage({
  searchParams,
}: AccountRoleRouterPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/account/login");
  }

  // Always read the current Sanity record. A JWT role can be stale after an
  // owner changes somebody's role from Admin/Sanity while their session lives.
  const customer = await getCustomerByDocumentId(session.user.id);

  if (!customer) {
    redirect("/account/access-denied?reason=account");
  }

  if (customer.status !== "ACTIVE") {
    redirect("/account/access-denied?reason=suspended");
  }

  // Staff roles always enter their business workspace directly.
  if (customer.role !== "CUSTOMER") {
    redirect(getRoleHomePath(customer.role));
  }

  // Customers stay in the customer journey. This preserves flows such as
  // "sign in before checkout" while protecting against external/open redirects.
  const params = await searchParams;
  const requestedNext = Array.isArray(params.next) ? params.next[0] : params.next;

  redirect(getSafeCustomerNextPath(requestedNext));
}
