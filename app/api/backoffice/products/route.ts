import { dbk109MaintenanceDecision, dbk109FreezeMessage } from '@/lib/db/dbk109-maintenance';
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { dbk69InventoryEnabled } from "@/lib/db/dbk69-inventory-neon";
import { dbk142RegisterZeroStockProduct } from "@/lib/db/dbk142-new-product";
import { dbk142ZeroStockKeys } from "@/lib/db/dbk142-new-product-core";
import { dbk109LegacyInventoryWriteBlocked } from "@/lib/db/dbk109-cutover-authority";
import { toSanityServiceError } from "@/lib/sanity-error";
import { generateProductSku } from "@/sanity/lib/sku";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type ReferenceOption = { _id: string; title: string; slug?: string };
type StoreLocationOption = { _id: string; name: string; code?: string; locationType?: "MAIN" | "BRANCH" };
type VariantInput = {
  title?: string;
  colour?: string;
  size?: string;
  sku?: string;
  price?: number | null;
  stockQuantity?: number | null;
};

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanProductName(value: FormDataEntryValue | null) {
  return clean(value).replace(/\s+/g, " ");
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const number = Number(clean(value));
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) return fallback;
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase());
}

function jsonArray(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  } catch {
    return [] as string[];
  }
}

function textList(value: FormDataEntryValue | null) {
  return clean(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

function references(ids: string[]) {
  return ids.map((id) => ({ _key: randomUUID().slice(0, 12), _type: "reference", _ref: id }));
}

function inventoryDocumentId(productId: string) {
  return `inventory.${productId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

async function uploadImage(file: File | null) {
  if (!file || file.size === 0) return undefined;
  if (!file.type.startsWith("image/")) throw new Error(`${file.name || "Upload"} is not an image.`);
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name || "Image"} is larger than 12 MB.`);
  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), {
    filename: file.name || `product-${Date.now()}`,
    contentType: file.type || undefined,
  });
  return { _type: "image", asset: { _type: "reference", _ref: asset._id } };
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  const exists = await serverClient.fetch<boolean>(`count(*[_type == "product" && slug.current == $slug]) > 0`, { slug: base });
  return exists ? `${base}-${randomUUID().slice(0, 6).toLowerCase()}` : base;
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const [categories, collections, spaces, styles, products, storeLocations] = await Promise.all([
    serverClient.fetch<ReferenceOption[]>(`*[_type == "category"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "collection"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "shopSpace"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "shopStyle"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "product"] | order(name asc){_id,"title":name,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<StoreLocationOption[]>(`*[_type == "storeLocation" && active != false] | order(name asc){_id,name,code,locationType}`, {}, { cache: "no-store" }),
  ]);

  return NextResponse.json({ categories, collections, spaces, styles, products, storeLocations, stockAuthority: dbk69InventoryEnabled() ? "neon" : "sanity" });
}

export async function POST(request: Request) {
  let pendingProductId: string | null = null;
  const maintenance = await dbk109MaintenanceDecision();
  if (maintenance !== 'OPEN') {
    return NextResponse.json({code:'DBK109_CUTOVER_FREEZE',retryable:false,
      message:dbk109FreezeMessage(maintenance)},
      {status:503,headers:{'Cache-Control':'private, no-store'}});
  }

  const staff = await getApiStaff(["ADMIN", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  // Fail closed if legacy inventory is blocked but the live inventory backend is not available.
  if (!dbk69InventoryEnabled() && dbk109LegacyInventoryWriteBlocked()) {
    return NextResponse.json({code:'DBK142_INVENTORY_UNAVAILABLE',
      message:'Product creation is temporarily unavailable while inventory is being prepared.'},
      {status:503,headers:{'Cache-Control':'private, no-store'}});
  }

  try {
    const form = await request.formData();
    const manager = staff.role === "MANAGER";
    const neonCreation = dbk69InventoryEnabled();
    const createRequestId = clean(form.get("createRequestId"));
    if (neonCreation && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createRequestId)) {
      return NextResponse.json({message:'Product form expired. Refresh and try again.'},{status:400});
    }
    if (manager && !staff.storeLocationId) {
      return NextResponse.json({ message: "Manager must be assigned to a store before creating products." }, { status: 403 });
    }
    if (manager && ["onHand", "initialStock", "incoming", "reserved", "reorderPoint", "unitCost", "procurementCost"].some(field => form.has(field))) {
      return NextResponse.json({ message: "Managers cannot edit stock quantities or production costs." }, { status: 403 });
    }
    const name = cleanProductName(form.get("name"));
    const price = numberValue(form.get("price"));
    const wholesalePriceText = clean(form.get("wholesalePrice"));
    const wholesaleQuantityText = clean(form.get("wholesaleMinQuantity"));
    const wholesalePrice = wholesalePriceText ? numberValue(form.get("wholesalePrice")) : 0;
    const wholesaleMinQuantity = wholesaleQuantityText ? Math.floor(numberValue(form.get("wholesaleMinQuantity"))) : 0;
    const primaryCategory = clean(form.get("primaryCategory"));

    if (!name) return NextResponse.json({ message: "Product name is required." }, { status: 400 });
    if (!(price > 0)) return NextResponse.json({ message: "Retail price must be greater than zero." }, { status: 400 });
    if (wholesalePriceText || wholesaleQuantityText) {
      if (!(wholesalePrice > 0)) return NextResponse.json({ message: "Wholesale price must be greater than zero." }, { status: 400 });
      if (wholesalePrice >= price) return NextResponse.json({ message: "Wholesale price must be lower than the retail price." }, { status: 400 });
      if (wholesaleMinQuantity < 2) return NextResponse.json({ message: "Wholesale quantity threshold must be at least 2." }, { status: 400 });
    }
    if (!primaryCategory) return NextResponse.json({ message: "Primary category is required." }, { status: 400 });

    if (manager && form.has("storeLocationId") && clean(form.get("storeLocationId")) && clean(form.get("storeLocationId")) !== staff.storeLocationId) {
      return NextResponse.json({ message: "Managers can only create products at their assigned store." }, { status: 403 });
    }
    const storeLocationId = manager ? staff.storeLocationId! : clean(form.get("storeLocationId"));
    const selectedLocation = storeLocationId
      ? await serverClient.fetch<StoreLocationOption | null>(
          `*[_type == "storeLocation" && _id == $storeLocationId && active != false][0]{_id,name,code,locationType}`,
          { storeLocationId },
          { cache: "no-store" },
        )
      : null;
    if (storeLocationId && !selectedLocation) return NextResponse.json({ message: "Select an active inventory location." }, { status: 400 });
    const mainLocations = !storeLocationId
      ? await serverClient.fetch<StoreLocationOption[]>(
          `*[_type == "storeLocation" && active != false && locationType == "MAIN"]{_id,name,code,locationType}`,
          {}, { cache: "no-store" },
        ) : [];
    // Only auto-select when the client has created exactly one MAIN store.
    // Multiple MAIN stores are valid, so require an explicit choice then.
    const storeLocation = selectedLocation || (mainLocations.length === 1 ? mainLocations[0] : null);
    if (!storeLocation && mainLocations.length > 1) {
      return NextResponse.json({ message: "Select the Main inventory location for this product." }, { status: 400 });
    }

    // A browser retry resumes the same product rather than generating another catalogue identity.
    const productId = `product.${(neonCreation ? createRequestId : randomUUID()).replaceAll("-", "")}`;
    const inventoryId = inventoryDocumentId(productId);
    // Check whether a previous request already saved this draft before any asset uploads.
    const existing = neonCreation ? await serverClient.fetch<{
      product: {_id:string;_rev:string;_type:string;name:string;price:number;wholesalePrice?:number;
        wholesaleMinQuantity?:number;primaryCategory?:string;dbk142CreateRequestId?:string;
        variantKeys?:string[];available?:boolean;slug?:string;sku?:string} | null;
      inventory: {_id:string;_rev:string;storeId?:string} | null;
    }>(`{
      "product": *[_id == $productId][0]{_id,_rev,_type,name,price,wholesalePrice,wholesaleMinQuantity,
        "primaryCategory":primaryCategory._ref,dbk142CreateRequestId,"variantKeys":variants[]._key,
        available,"slug":slug.current,sku},
      "inventory": *[_id == $inventoryId][0]{_id,_rev,"storeId":defaultStore._ref}
    }`, {productId,inventoryId}, {cache:'no-store'}) : {product:null,inventory:null};
    if (existing.product || existing.inventory) {
      if (!existing.product || !existing.inventory || existing.product._type !== 'product' ||
          existing.product.dbk142CreateRequestId !== createRequestId ||
          existing.product.name !== name || Number(existing.product.price) !== price ||
          Number(existing.product.wholesalePrice || 0) !== wholesalePrice ||
          Number(existing.product.wholesaleMinQuantity || 0) !== wholesaleMinQuantity ||
          existing.product.primaryCategory !== primaryCategory ||
          existing.inventory.storeId !== storeLocation?._id) {
        return NextResponse.json({code:'DBK142_CREATE_REQUEST_CONFLICT',
          message:'This product form was already used for a different product. Open a fresh form to continue.'},
          {status:409,headers:{'Cache-Control':'private, no-store'}});
      }
    }
    const slug = existing.product?.slug || await uniqueSlug(name);
    const sku = existing.product?.sku || generateProductSku(name, productId);
    const now = new Date().toISOString();
    const heroImage = existing.product ? undefined : await uploadImage(form.get("heroImage") instanceof File ? form.get("heroImage") as File : null);
    const galleryFiles = form.getAll("galleryImages").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const gallery = (await Promise.all((existing.product ? [] : galleryFiles).map((file) => uploadImage(file))))
      .filter((image): image is NonNullable<typeof image> => Boolean(image))
      .map((image) => ({ ...image, _key: randomUUID().slice(0, 12) }));

    let variants: VariantInput[] = [];
    try {
      const raw = clean(form.get("variants"));
      variants = raw ? JSON.parse(raw) as VariantInput[] : [];
      if (!Array.isArray(variants)) variants = [];
    } catch {
      return NextResponse.json({ message: "Product variants are invalid." }, { status: 400 });
    }

    const variantDocuments = [];
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const image = existing.product ? undefined : await uploadImage(form.get(`variantImage-${index}`) instanceof File ? form.get(`variantImage-${index}`) as File : null);
      if (manager && variant.stockQuantity !== undefined && variant.stockQuantity !== null) {
        return NextResponse.json({ message: "Managers cannot set variant stock quantities." }, { status: 403 });
      }
      variantDocuments.push({
        _key: randomUUID().slice(0, 12),
        _type: "object",
        title: variant.title?.trim() || undefined,
        colour: variant.colour?.trim() || undefined,
        size: variant.size?.trim() || undefined,
        sku: variant.sku?.trim() || undefined,
        price: typeof variant.price === "number" && variant.price > 0 ? variant.price : undefined,
        stockQuantity: manager ? 0 : typeof variant.stockQuantity === "number" && variant.stockQuantity >= 0 ? variant.stockQuantity : undefined,
        ...(image ? { image } : {}),
      });
    }

    const variantStockTotal = variantDocuments.reduce(
      (total, variant) => total + (typeof variant.stockQuantity === "number" ? variant.stockQuantity : 0),
      0,
    );
    const initialStock = manager ? 0 : variantDocuments.length > 0
      ? variantStockTotal
      : Math.max(0, numberValue(form.get("initialStock")));
    // All new inventory-authoritative products must begin at ZERO physical stock.
    // Stock is added afterwards using the audited Purchase/Receive workflow.
    if (neonCreation && (initialStock !== 0 || numberValue(form.get("incoming")) !== 0 ||
        variantDocuments.some(v => Number(v.stockQuantity || 0) !== 0))) {
      return NextResponse.json({code:'DBK142_STOCK_MUST_START_AT_ZERO',
        message:'New products start with zero stock. Create the product first, then add stock through Inventory.'},
        {status:400});
    }
    if (neonCreation && !storeLocation) {
      return NextResponse.json({message:'Choose an inventory location before creating the product.'},{status:400});
    }
    const procurementCost = manager ? 0 : Math.max(0, numberValue(form.get("procurementCost")));
    const ecommerceEnabled = booleanValue(form.get("ecommerceEnabled"), true);
    const posEnabled = booleanValue(form.get("posEnabled"), true);
    if (!ecommerceEnabled && !posEnabled) {
      return NextResponse.json({ message: "Select at least one sales channel: E-commerce or POS." }, { status: 400 });
    }
    const compareAtPrice = numberValue(form.get("compareAtPrice"));
    const salePrice = numberValue(form.get("salePrice"));
    const retailPriceForSale = numberValue(form.get("retailPrice")) || numberValue(form.get("price"));
    if (compareAtPrice > 0 && retailPriceForSale > 0 && compareAtPrice <= retailPriceForSale) {
      return NextResponse.json({ message: "Compare-at price must be higher than the retail price." }, { status: 400 });
    }
    if (salePrice > 0 && retailPriceForSale > 0 && salePrice >= retailPriceForSale) {
      return NextResponse.json({ message: "Sale price must be lower than the retail price." }, { status: 400 });
    }
    const saleStartAt = clean(form.get("saleStartAt"));
    const saleEndAt = clean(form.get("saleEndAt"));
    if (saleStartAt && saleEndAt && new Date(saleEndAt).getTime() <= new Date(saleStartAt).getTime()) {
      return NextResponse.json({ message: "Sale end must be after sale start." }, { status: 400 });
    }
    const rating = numberValue(form.get("rating"));
    const reviewCount = Math.max(0, Math.floor(numberValue(form.get("reviewCount"))));

    const productDocument = {
      _id: productId,
      _type: "product",
      name,
      slug: { _type: "slug", current: slug },
      sku,
      price,
      ...(wholesalePrice > 0 && wholesaleMinQuantity >= 2 ? { wholesalePrice, wholesaleMinQuantity } : {}),
      procurementCost,
      ecommerceEnabled,
      posEnabled,
      ...(compareAtPrice > 0 ? { compareAtPrice } : {}),
      ...(rating >= 4 && rating <= 4.8 ? { rating } : {}),
      ...(reviewCount > 0 ? { reviewCount } : {}),
      primaryCategory: { _type: "reference", _ref: primaryCategory },
      categories: references(jsonArray(form.get("categories")).filter((id) => id !== primaryCategory)),
      collections: references(jsonArray(form.get("collections"))),
      pairings: references(jsonArray(form.get("pairings")).filter((id) => id !== productId)),
      merchandisedSamples: references(jsonArray(form.get("merchandisedSamples")).filter((id) => id !== productId)),
      spaces: references(jsonArray(form.get("spaces"))),
      styles: references(jsonArray(form.get("styles"))),
      ...(heroImage ? { heroImage } : {}),
      ...(gallery.length ? { gallery } : {}),
      shortDescription: clean(form.get("shortDescription")) || undefined,
      description: clean(form.get("description")) || undefined,
      colours: textList(form.get("colours")),
      variants: variantDocuments,
      materials: textList(form.get("materials")),
      dimensions: clean(form.get("dimensions")) || undefined,
      careInstructions: clean(form.get("careInstructions")) || undefined,
      initialStock,
      featured: booleanValue(form.get("featured")),
      newArrival: booleanValue(form.get("newArrival")),
      bestSeller: booleanValue(form.get("bestSeller")),
      onSale: booleanValue(form.get("onSale")),
      ...(salePrice > 0 ? { salePrice } : {}),
      ...(saleStartAt ? { saleStartAt } : {}),
      ...(saleEndAt ? { saleEndAt } : {}),
      // Keep the catalogue item unavailable until its zero-stock registration is confirmed.
      available: neonCreation ? false : booleanValue(form.get("available"), true),
      ...(neonCreation ? { dbk142CreateRequestId: createRequestId } : {}),
    };

    if (neonCreation) {
      // Never reinterpret an existing draft as having different variants on retry.
      if (existing.product && (existing.product.variantKeys || []).length !== variantDocuments.length) {
        return NextResponse.json({code:'DBK142_CREATE_REQUEST_CONFLICT',
          message:'The product draft has changed. Open the saved item rather than recreating it.'},
          {status:409,headers:{'Cache-Control':'private, no-store'}});
      }
      if (!existing.product) {
        // A single catalogue transaction creates the product and its metadata inventory record.
        // Both are hidden from shoppers until physical stock identities exist in Neon.
        const transaction = serverClient.transaction();
        transaction.create(productDocument);
        transaction.create({
          _id: inventoryId,
          _type: 'inventoryRecord',
          product: { _type:'reference',_ref:productId },
          location: storeLocation!.name,
          defaultStore: { _type:'reference',_ref:storeLocation!._id },
          locationBalances: [{
            _key:`store-${storeLocation!._id.replace(/[^a-zA-Z0-9]/g, '').slice(0,24)}`,
            store:{_type:'reference',_ref:storeLocation!._id},
            storeId:storeLocation!._id,storeName:storeLocation!.name,storeCode:storeLocation!.code,
            onHand:0,incoming:0,
            ...(variantDocuments.length ? {variants:variantDocuments.map(v=>({
              _key:`variant-${String(v._key).replace(/[^a-zA-Z0-9]/g, '').slice(0,24)}`,
              variantId:v._key,variantLabel:v.title || [v.colour,v.size].filter(Boolean).join(' / '),
              onHand:0,incoming:0,
            }))} : {}),
          }],
          reserved:0,incoming:0,reorderPoint:Math.max(0,numberValue(form.get('reorderPoint'),5)),
          unitCost:procurementCost,createdAt:now,updatedAt:now,
        });
        await transaction.commit();
      }
      pendingProductId = productId;
      const saved = await serverClient.fetch<{
        product: {_id:string;_rev:string;variantKeys?:string[];available?:boolean;slug?:string;sku?:string} | null;
        inventory: {_id:string;_rev:string} | null;
      }>(`{
        "product": *[_id == $productId][0]{_id,_rev,"variantKeys":variants[]._key,available,"slug":slug.current,sku},
        "inventory": *[_id == $inventoryId][0]{_id,_rev}
      }`, {productId,inventoryId}, {cache:'no-store'});
      if (!saved.product?._rev || !saved.inventory?._rev) {
        throw new Error('Catalogue creation not fully persisted; retry needed');
      }
      const variantKeys = dbk142ZeroStockKeys({
        storeLocationId:storeLocation!._id,
        variantIds:saved.product.variantKeys || [],
        initialStock:0,incoming:0,variantStock:[],
      });
      await dbk142RegisterZeroStockProduct({
        productId, locationId:storeLocation!._id,variantIds:variantKeys,
        productRevision:saved.product._rev,inventoryRevision:saved.inventory._rev,
      });
      // Reveal the product only after verifying that every stock identity exists.
      if (booleanValue(form.get('available'),true) && !saved.product.available) {
        await serverClient.patch(productId).ifRevisionId(saved.product._rev).set({available:true}).commit();
      }
      pendingProductId = null;
      revalidatePath('/');
      revalidatePath('/shop');
      return NextResponse.json({ok:true,productId,slug:saved.product.slug,sku:saved.product.sku},
        {status:existing.product ? 200 : 201});
    }

    // Legacy creation path is retained only when the old inventory backend remains authoritative.
    const transaction = serverClient.transaction();
    transaction.create(productDocument);
      transaction.create({
        _id: inventoryDocumentId(productId),
        _type: "inventoryRecord",
        product: { _type: "reference", _ref: productId },
        location: storeLocation?.name || "Unassigned",
        ...(storeLocation ? {
          defaultStore: { _type: "reference", _ref: storeLocation._id },
          locationBalances: [{
            _key: `store-${storeLocation._id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`,
            store: { _type: "reference", _ref: storeLocation._id },
            storeId: storeLocation._id,
            storeName: storeLocation.name,
            storeCode: storeLocation.code,
            onHand: initialStock,
            incoming: Math.max(0, numberValue(form.get("incoming"))),
            ...(variantDocuments.length ? { variants: variantDocuments.map((variant) => ({
              _key: `variant-${String(variant._key).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`,
              variantId: variant._key,
              variantLabel: variant.title || [variant.colour, variant.size].filter(Boolean).join(" / "),
              onHand: Math.max(0, Number(variant.stockQuantity || 0)),
              incoming: 0,
            })) } : {}),
          }],
        } : {}),
        reserved: 0,
        incoming: Math.max(0, numberValue(form.get("incoming"))),
        reorderPoint: Math.max(0, numberValue(form.get("reorderPoint"), 5)),
        unitCost: procurementCost,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.commit();
      revalidatePath("/");
      revalidatePath("/shop");

      return NextResponse.json({ ok: true, productId, slug, sku }, { status: 201 });
  } catch (cause) {
    console.error("Product creation failed:", {productId:pendingProductId, cause});
    if (pendingProductId) {
      return NextResponse.json({code:'DBK142_STOCK_REGISTRATION_PENDING',productId:pendingProductId,
        message:'Product details were saved, but inventory setup could not finish. Click Create Product again to resume the same item; do not start another copy.'},
        {status:503,headers:{'Cache-Control':'private, no-store'}});
    }
    const failure = toSanityServiceError(cause, "Product creation failed.");
    return NextResponse.json({message:failure.status === 402
        ? 'The product catalogue cannot accept new entries right now. Contact the administrator.'
        : 'Product could not be created. Please retry or contact the administrator if this continues.'},
      {status:failure.status,headers:{'Cache-Control':'private, no-store'}});
  }
}
