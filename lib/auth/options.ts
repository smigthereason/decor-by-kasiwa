import type { NextAuthOptions } from "next-auth";

import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { authenticatePasswordCustomer } from "@/lib/auth/password-auth";
import { ensureGoogleCustomer, getGoogleCustomer } from "@/lib/auth/sanity-users";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId) throw new Error("GOOGLE_CLIENT_ID is missing.");
if (!googleClientSecret) throw new Error("GOOGLE_CLIENT_SECRET is missing.");

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase() || "";
        const password = credentials?.password || "";
        if (!email || !password) return null;

        const customer = await authenticatePasswordCustomer(email, password);
        if (!customer) return null;

        return {
          id: customer._id,
          name: customer.name,
          email: customer.email,
          role: customer.role,
        };
      },
    }),
    GoogleProvider({ clientId: googleClientId, clientSecret: googleClientSecret }),
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
    async signIn({ user, account, profile }) {
      try {
        if (account?.provider === "credentials") return Boolean(user?.id);

        if (account?.provider !== "google" || !account.providerAccountId || !user.email) return false;

        const googleProfile = profile as { name?: string; picture?: string } | undefined;
        const customer = await ensureGoogleCustomer({
          googleId: account.providerAccountId,
          name: user.name || googleProfile?.name || user.email.split("@")[0],
          email: user.email,
          image: user.image || googleProfile?.picture || null,
        });

        return customer.status === "ACTIVE";
      } catch (error) {
        console.error("Sign-in failed:", error);
        return false;
      }
    },

    async jwt({ token, account, user }) {
      if (account?.provider === "credentials" && user?.id) {
        token.customerId = user.id;
        token.role = user.role;
      }

      if (account?.provider === "google" && account.providerAccountId) {
        const customer = await getGoogleCustomer(account.providerAccountId);
        if (customer) {
          token.customerId = customer._id;
          token.role = customer.role;
          token.googleId = customer.googleId ?? undefined;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.customerId || "";
        session.user.role = token.role || "CUSTOMER";
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
