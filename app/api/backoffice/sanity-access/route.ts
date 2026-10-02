import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

function tokenShape() {
  const raw = process.env.SANITY_API_WRITE_TOKEN ?? "";
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  return {
    present: trimmed.length > 0,
    length: trimmed.length,
    prefix: trimmed.slice(0, 3),
    hadWrappingQuotes: raw.trim() !== trimmed,
    hadWhitespace: raw !== raw.trim(),
  };
}

async function identity(token: string) {
  const response = await fetch("https://api.sanity.io/v2021-06-07/users/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) {
    return NextResponse.json({ message: "Admin only." }, { status: staff.status });
  }

  const token = process.env.SANITY_API_WRITE_TOKEN?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? serverClient.config().projectId;
  const dataset = serverClient.config().dataset;

  let who: { status: number; body: unknown } | { error: string };
  try {
    who = token ? await identity(token) : { status: 0, body: null };
  } catch (cause) {
    who = { error: cause instanceof Error ? cause.message : "Identity lookup failed." };
  }

  let writeProbe: { status: number | null; message: string };
  try {
    await serverClient.patch("sanity-write-probe-missing").set({ probedAt: new Date().toISOString() }).commit();
    writeProbe = { status: 200, message: "Unexpected success against a missing document." };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Write probe failed.";
    const statusCode =
      cause && typeof cause === "object" && "statusCode" in cause && typeof cause.statusCode === "number"
        ? cause.statusCode
        : null;
    writeProbe = { status: statusCode, message };
  }

  const forbidden = writeProbe.status === 403 || writeProbe.message.toLowerCase().includes("403");
  const missingDocument = writeProbe.message.toLowerCase().includes("not found") || writeProbe.status === 404;

  return NextResponse.json({
    projectId,
    dataset,
    token: tokenShape(),
    identity: who,
    writeProbe,
    diagnosis: forbidden
      ? "Token is recognized but cannot mutate. Recreate it as an Editor token for this project, replace SANITY_API_WRITE_TOKEN in the Production env, then redeploy. A Viewer token, or a Growth-only role left over after a downgrade, produces this 403. The Free plan still allows Editor tokens."
      : missingDocument
        ? "Write permission is present. The probe failed only because the dummy document does not exist, which is the expected success case."
        : "Probe was inconclusive. Read writeProbe.message for the raw Sanity response.",
  });
}
