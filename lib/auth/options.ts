import type {
  NextAuthOptions,
} from "next-auth";

import GoogleProvider from "next-auth/providers/google";

import {
  ensureGoogleCustomer,
  getGoogleCustomer,
} from "@/lib/auth/sanity-users";

const googleClientId =
  process.env.GOOGLE_CLIENT_ID;

const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId) {
  throw new Error(
    "GOOGLE_CLIENT_ID is missing.",
  );
}

if (!googleClientSecret) {
  throw new Error(
    "GOOGLE_CLIENT_SECRET is missing.",
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  pages: {
    signIn: "/account/login",
    error: "/account/login",
  },

  callbacks: {
    async signIn({
      user,
      account,
      profile,
    }) {
      try {
        if (
          account?.provider !== "google" ||
          !account.providerAccountId ||
          !user.email
        ) {
          return false;
        }

        const googleProfile = profile as
          | {
              name?: string;
              picture?: string;
            }
          | undefined;

        const customer =
          await ensureGoogleCustomer({
            googleId:
              account.providerAccountId,

            name:
              user.name ||
              googleProfile?.name ||
              user.email.split("@")[0],

            email: user.email,

            image:
              user.image ||
              googleProfile?.picture ||
              null,
          });

        return customer.status === "ACTIVE";
      } catch (error) {
        console.error(
          "Google sign-in failed:",
          error,
        );

        return false;
      }
    },

    async jwt({
      token,
      account,
    }) {
      if (
        account?.provider === "google" &&
        account.providerAccountId
      ) {
        const customer =
          await getGoogleCustomer(
            account.providerAccountId,
          );

        if (customer) {
          token.customerId =
            customer._id;

          token.role =
            customer.role;

          token.googleId =
            customer.googleId;
        }
      }

      return token;
    },

    async session({
      session,
      token,
    }) {
      if (session.user) {
        session.user.id =
          token.customerId || "";

        session.user.role =
          token.role || "CUSTOMER";
      }

      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
