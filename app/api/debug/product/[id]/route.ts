import { NextResponse } from "next/server";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }

  const { id } = await context.params;
  const rawId = decodeURIComponent(id).trim();
  const publishedId = rawId.replace(/^drafts\./, "");
  const draftId = `drafts.${publishedId}`;

  try {
    const documents = await serverClient
      .withConfig({ perspective: "raw" })
      .fetch<
        Array<{
          _id: string;
          _type?: string;
          _rev?: string;
          _createdAt?: string;
          _updatedAt?: string;
          name?: string;
          slug?: { current?: string };
          price?: number;
          initialStock?: number;
          available?: boolean;
          ecommerceEnabled?: boolean;
          posEnabled?: boolean;
        }>
      >(
        `*[_id in $ids]{
          _id,
          _type,
          _rev,
          _createdAt,
          _updatedAt,
          name,
          slug,
          price,
          initialStock,
          available,
          ecommerceEnabled,
          posEnabled
        }`,
        { ids: [publishedId, draftId] },
      );

    const published = documents.find((document) => document._id === publishedId) ?? null;
    const draft = documents.find((document) => document._id === draftId) ?? null;

    const eligibility = (document: typeof published) =>
      document
        ? {
            hasSlug: Boolean(document.slug?.current),
            hasPositivePrice: typeof document.price === "number" && document.price > 0,
            availablePassesLegacyFilter: document.available !== false,
            ecommercePassesFilter: document.ecommerceEnabled !== false,
            posPassesFilter: document.posEnabled !== false,
          }
        : null;

    return NextResponse.json(
      {
        requestedId: rawId,
        publishedId,
        published,
        publishedEligibility: eligibility(published),
        draft,
        draftEligibility: eligibility(draft),
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    console.error("Product diagnostic query failed:", error);
    return NextResponse.json(
      {
        message: "Product diagnostic query failed.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
