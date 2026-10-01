import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { serverClient } from "@/sanity/lib/serverClient";
import { dataset, projectId } from "@/sanity/env";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ sku: string }> };

const projection = `{
  _id,
  _type,
  _createdAt,
  _updatedAt,
  name,
  sku,
  "slug": slug.current,
  price,
  initialStock,
  available,
  ecommerceEnabled,
  posEnabled
}`;

export async function GET(_request: Request, { params }: Params) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Debug endpoint disabled in production." }, { status: 404 });
  }

  const { sku } = await params;
  const requestedSku = decodeURIComponent(sku).trim();
  const paramsObj = { sku: requestedSku };

  const rawQuery = `*[_type == "product" && sku == $sku] ${projection}`;
  const ecommerceQuery = `*[
    _type == "product" &&
    sku == $sku &&
    defined(slug.current) &&
    defined(price) &&
    price > 0 &&
    ecommerceEnabled != false
  ] ${projection}`;
  const posQuery = `*[
    _type == "product" &&
    sku == $sku &&
    defined(slug.current) &&
    defined(price) &&
    price > 0 &&
    posEnabled != false
  ] ${projection}`;

  try {
    const [
      publicRaw,
      publicEcommerce,
      publicPos,
      serverRaw,
      serverEcommerce,
      serverPos,
    ] = await Promise.all([
      client.fetch(rawQuery, paramsObj, { cache: "no-store" }),
      client.fetch(ecommerceQuery, paramsObj, { cache: "no-store" }),
      client.fetch(posQuery, paramsObj, { cache: "no-store" }),
      serverClient.fetch(rawQuery, paramsObj, { cache: "no-store" }),
      serverClient.fetch(ecommerceQuery, paramsObj, { cache: "no-store" }),
      serverClient.fetch(posQuery, paramsObj, { cache: "no-store" }),
    ]);

    return NextResponse.json({
      requestedSku,
      sanityTarget: { projectId, dataset },
      publicCatalogueClient: {
        raw: publicRaw,
        ecommercePredicate: publicEcommerce,
        posPredicate: publicPos,
      },
      authenticatedPublishedClient: {
        raw: serverRaw,
        ecommercePredicate: serverEcommerce,
        posPredicate: serverPos,
      },
    });
  } catch (error) {
    console.error("Catalogue SKU diagnostic failed:", error);
    return NextResponse.json(
      {
        requestedSku,
        sanityTarget: { projectId, dataset },
        error: error instanceof Error ? error.message : "Unknown diagnostic error",
      },
      { status: 500 },
    );
  }
}
