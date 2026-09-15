import "server-only";

import { serverClient } from "@/sanity/lib/serverClient";

export const FULFILMENT_STAGES = ["PRODUCTION", "PACKAGING", "DELIVERY"] as const;
export type FulfilmentStage = (typeof FULFILMENT_STAGES)[number];

export type WorkflowSeed = {
  fulfilmentStages: FulfilmentStage[];
  currentFulfilmentStage?: FulfilmentStage;
};

export async function workflowForProducts(productIds: string[]): Promise<WorkflowSeed> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return { fulfilmentStages: [] };

  const configured = await serverClient.fetch<Array<{ stages?: FulfilmentStage[]; parentStages?: FulfilmentStage[] }>>(
    `*[_type == "product" && _id in $ids]{
      "stages": primaryCategory->fulfilmentStages,
      "parentStages": primaryCategory->parent->fulfilmentStages
    }`,
    { ids },
    { cache: "no-store" },
  );
  const selected = new Set<FulfilmentStage>();
  for (const category of configured) {
    const inheritedStages = [...(category.parentStages || []), ...(category.stages || [])];
    for (const stage of FULFILMENT_STAGES) if (inheritedStages.includes(stage)) selected.add(stage);
  }
  const fulfilmentStages = FULFILMENT_STAGES.filter((stage) => selected.has(stage));
  return { fulfilmentStages, currentFulfilmentStage: fulfilmentStages[0] };
}

export function roleForStage(stage: FulfilmentStage) {
  switch (stage) {
    case "PRODUCTION": return "PRODUCTION_STAFF" as const;
    case "PACKAGING": return "PACKAGING_STAFF" as const;
    case "DELIVERY": return "DELIVERY_STAFF" as const;
  }
}
