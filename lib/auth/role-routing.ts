export type RoleRoute = "CUSTOMER" | "STORE_STAFF" | "STORE" | "ADMIN";

/**
 * Canonical landing destination for an authenticated role.
 *
 * CUSTOMER intentionally remains on the customer-facing site. Staff roles
 * are sent to their operational workspace instead of the customer account.
 */
export function getRoleHomePath(
  role: RoleRoute | null | undefined,
  customerPath = "/account",
) {
  switch (role) {
    case "ADMIN":
      return "/admin";

    case "STORE":
    case "STORE_STAFF":
      return "/store";

    case "CUSTOMER":
    default:
      return customerPath;
  }
}

export function isStaffRole(role: RoleRoute | null | undefined) {
  return role === "ADMIN" || role === "STORE" || role === "STORE_STAFF";
}

/**
 * Customer callbacks may return to a requested customer-facing route such as
 * checkout, but they must never be able to use `next` as an open redirect or
 * as a shortcut into protected business/internal surfaces.
 */
export function getSafeCustomerNextPath(rawNext: string | null | undefined) {
  if (!rawNext) return "/account";

  const nextPath = rawNext.trim();

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/account";
  }

  const blockedPrefixes = [
    "/admin",
    "/store",
    "/studio",
    "/api",
    "/account/route",
    "/account/login",
    "/account/access-denied",
  ];

  if (blockedPrefixes.some((prefix) => nextPath.startsWith(prefix))) {
    return "/account";
  }

  return nextPath;
}
