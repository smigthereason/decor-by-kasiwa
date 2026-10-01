import { NextResponse } from "next/server";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sku: string }>;
};

type DiagnosticProduct = {
  _id: string;
  _type?: string;
  _rev?: string;
  _createdAt?: string;
  _updatedAt?: string;
  name?: string;
  sku?: string;
  slug?: { current?: string };
  price?: number;
  initialStock?: number;
  available?: boolean;
  ecommerceEnabled?: boolean;
  posEnabled?: boolean;
};

function eligibility(document: DiagnosticProduct) {
  return {
    hasSlug: Boolean(document.slug?.current),
    hasPositivePrice: typeof document.price === "number" && document.price > 0,
    availablePassesLegacyFilter: document.available !== false,
    ecommercePassesFilter: document.ecommerceEnabled !== false,
    posPassesFilter: document.posEnabled !== false,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const { sku } = await context.params;
  const requestedSku = decodeURIComponent(sku).trim();

  try {
    const configuredProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? null;
    const configuredDataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? null;

    const documents = await serverClient
      .withConfig({ perspective: "raw" })
      .fetch<DiagnosticProduct[]>(
        `*[_type == "product" && sku == $sku]{
          _id,
          _type,
          _rev,
          _createdAt,
          _updatedAt,
          name,
          sku,
          slug,
          price,
          initialStock,
          available,
          ecommerceEnabled,
          posEnabled
        } | order(_updatedAt desc)`,
        { sku: requestedSku },
      );

    return NextResponse.json(
      {
        requestedSku,
        sanityTarget: {
          projectId: configuredProjectId,
          dataset: configuredDataset,
        },
        matchCount: documents.length,
        matches: documents.map((document) => ({
          ...document,
          documentState: document._id.startsWith("drafts.") ? "draft" : "published",
          eligibility: eligibility(document),
        })),
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    console.error("Product SKU diagnostic query failed:", error);
    return NextResponse.json(
      {
        message: "Product SKU diagnostic query failed.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
