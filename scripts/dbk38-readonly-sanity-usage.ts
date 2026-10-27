/**
 * DBK-38: READ-ONLY diagnostic. Makes one Sanity GROQ query.
 * Run: npx sanity exec scripts/dbk38-readonly-sanity-usage.ts --with-user-token
 * Does not archive, mutate, delete, or move anything.
 */
import {getCliClient} from "sanity/cli";

const client = getCliClient().withConfig({
  apiVersion: "2026-08-27",
  useCdn: false,
  perspective: "raw",
});

async function main() {
  const {projectId, dataset} = client.config();
  if (projectId !== "g34n810u" || dataset !== "production") {
    throw new Error(`STOP: Expected g34n810u.production, got ${projectId}.${dataset}`);
  }

  const query = `{
    "allDocumentsIncludingAssets": count(*[]),
    "imageAssets": count(*[_type == "sanity.imageAsset"]),
    "fileAssets": count(*[_type == "sanity.fileAsset"]),
    "estimatedQuotaDocuments": count(*[!(_type in ["sanity.imageAsset", "sanity.fileAsset", "sanity.videoAsset", "sanity.tree", "sanity.directory", "sanity.symlink", "sanity.assist.task.status"] || _type match "system.*")]),
    "auditEvents": count(*[_type == "auditEvent"]),
    "clientErrors": count(*[_type == "auditEvent" && eventType == "CLIENT_ERROR"]),
    "staffLogins": count(*[_type == "auditEvent" && eventType == "STAFF_LOGIN"]),
    "staffLogouts": count(*[_type == "auditEvent" && eventType == "STAFF_LOGOUT"]),
    "staffSessions": count(*[_type == "staffSession"]),
    "activeStaffSessions": count(*[_type == "staffSession" && status == "ACTIVE"]),
    "endedStaffSessions": count(*[_type == "staffSession" && status == "ENDED"]),
    "paymentTransactions": count(*[_type == "paymentTransaction"]),
    "commerceOrders": count(*[_type == "commerceOrder"])
  }`;
  const counts = await client.fetch<Record<string, number>>(query);
  console.log(JSON.stringify({
    mode: "READ ONLY — NO MUTATIONS",
    projectId,
    dataset,
    checkedAt: new Date().toISOString(),
    counts,
    note: "estimatedQuotaDocuments is an approximation. Sanity Manage > Usage is the billing authority; other datasets and platform exclusions may affect the total."
  }, null, 2));
}
main().catch((error) => {console.error(error); process.exitCode = 1;});
