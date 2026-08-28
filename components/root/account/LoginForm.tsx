"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { status } = useSession();

  const [loading, setLoading] =
    useState(false);

  const authError =
    searchParams.get("error");

  const requestedNext =
    searchParams.get("next");

  const roleRouterUrl =
    requestedNext
      ? `/account/route?next=${encodeURIComponent(requestedNext)}`
      : "/account/route";

  /*
   * If the user already has an active session,
   * always send them through the role router.
   *
   * CUSTOMER    -> requested customer page / account
   * STORE_STAFF -> /store
   * STORE       -> /store
   * ADMIN       -> /admin
   */
  useEffect(() => {
    if (
      status === "authenticated"
    ) {
      router.replace(
        roleRouterUrl,
      );
    }
  }, [status, router, roleRouterUrl]);

  async function loginWithGoogle() {
    setLoading(true);

    try {
      await signIn(
        "google",
        {
          callbackUrl:
            roleRouterUrl,
        },
      );
    } catch (error) {
      console.error(
        "Google login failed:",
        error,
      );

      setLoading(false);
    }
  }

  if (
    status === "loading" ||
    status ===
      "authenticated"
  ) {
    return (
      <div className="grid min-h-48 place-items-center">
        <div className="text-center">
          <div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10" />

          <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Checking account…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl">
      <div className="flex gap-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
        <ShieldCheck
          size={19}
          strokeWidth={1.45}
          className="mt-0.5 shrink-0 text-[var(--deep-green)]"
        />

        <div>
          <p className="text-sm font-medium text-[var(--ink)]">
            Secure Google sign in
          </p>

          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Decor by Kasiwa uses
            Google to verify your
            identity. Your Google
            password is never
            shared with or stored
            by us.
          </p>
        </div>
      </div>

      {authError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-xs leading-relaxed text-red-800">
          We could not complete
          your sign in. Please try
          again. If your Google
          account is not currently
          permitted for this test
          application, add it as a
          test user in Google
          Cloud.
        </div>
      )}

      <button
        type="button"
        onClick={
          loginWithGoogle
        }
        disabled={loading}
        className="
          focus-ring
          group
          mt-8
          flex
          min-h-[54px]
          w-full
          items-center
          justify-center
          gap-4
          rounded-full
          bg-[var(--deep-green)]
          px-6
          text-[12px]
          font-semibold
          !text-soft-cream
          transition-all
          hover:shadow-lg
          disabled:cursor-wait
          disabled:opacity-60
        "
      >
        <span
          className="
            grid size-8
            shrink-0
            place-items-center
            rounded-full
            bg-white
            text-[15px]
            font-bold
            text-[#4285F4]
          "
          aria-hidden="true"
        >
          G
        </span>

        <span>
          {loading
            ? "Connecting to Google…"
            : "Continue with Google"}
        </span>

        {!loading && (
          <ArrowRight
            size={15}
            className="transition-transform group-hover:translate-x-1"
          />
        )}
      </button>

      <div className="mt-8 border-t hairline pt-6">
        <div className="flex items-start gap-3">
          <CheckCircle2
            size={16}
            strokeWidth={1.5}
            className="mt-0.5 shrink-0 text-[var(--sage-green)]"
          />

          <p className="text-xs leading-relaxed text-[var(--muted)]">
            If this is your first
            visit, your Decor by
            Kasiwa account will be
            created automatically
            after Google verifies
            your identity.
          </p>
        </div>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-[var(--muted)]">
        Your account permissions
        determine which Decor by
        Kasiwa workspace you can
        access after signing in.
      </p>
    </div>
  );
}
