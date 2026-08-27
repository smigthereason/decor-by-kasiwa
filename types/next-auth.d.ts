import type {
  DefaultSession,
} from "next-auth";

import type {
  CustomerRole,
} from "@/lib/auth/sanity-users";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: CustomerRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    customerId?: string;
    googleId?: string;
    role?: CustomerRole;
  }
}
