import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import DeveloperConsole from "@/components/developer/DeveloperConsole";
import { authOptions } from "@/lib/auth/options";
import { getDeveloperAuditTrail } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

const DEVELOPER_EMAILS = new Set(["victor.dmaina@gmail.com", "kantonyk13@gmail.com"]);

export default async function DeveloperPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/account/login?callbackUrl=%2Fdeveloper");
  const email = session.user.email.trim().toLowerCase();
  if (!DEVELOPER_EMAILS.has(email)) notFound();

  const { events, total } = await getDeveloperAuditTrail(31);
  return <DeveloperConsole events={events} totalRecorded={total} accessEmail={email} />;
}
