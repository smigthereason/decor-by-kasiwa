import {
  getServerSession,
} from "next-auth";

import {
  redirect,
} from "next/navigation";

import {
  authOptions,
} from "@/lib/auth/options";

import {
  getCustomerByDocumentId,
} from "@/lib/auth/sanity-users";

export const dynamic =
  "force-dynamic";

export default async function AccountRoleRouterPage() {
  /*
   * There must be an authenticated
   * Google/NextAuth session.
   */
  const session =
    await getServerSession(
      authOptions,
    );

  if (!session?.user?.id) {
    redirect(
      "/account/login",
    );
  }

  /*
   * Read the CURRENT Sanity user.
   *
   * We intentionally don't rely
   * only on the role stored in the
   * JWT because roles can be
   * changed from Sanity Studio.
   */
  const customer =
    await getCustomerByDocumentId(
      session.user.id,
    );

  if (!customer) {
    redirect(
      "/account/access-denied?reason=account",
    );
  }

  /*
   * Suspended accounts cannot enter
   * a customer or staff workspace.
   */
  if (
    customer.status !==
    "ACTIVE"
  ) {
    redirect(
      "/account/access-denied?reason=suspended",
    );
  }

  /*
   * ROLE DESTINATIONS
   *
   * ADMIN    -> Admin Office
   * STORE    -> Store Operations
   * CUSTOMER -> Customer website
   */
  switch (customer.role) {
    case "ADMIN":
      redirect("/admin");

    case "STORE":
      redirect("/store");

    case "CUSTOMER":
    default:
      redirect("/");
  }
}
