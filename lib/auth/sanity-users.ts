import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@sanity/client";

export type CustomerRole = "CUSTOMER" | "STORE_STAFF" | "STORE" | "ADMIN";
export type CustomerStatus = "ACTIVE" | "SUSPENDED";
export type CustomerSource = "GOOGLE" | "GUEST_CHECKOUT" | "ADMIN";

export type SanityCustomer = {
  _id: string;
  name: string;
  email: string;
  image?: string | null;
  googleId: string;
  role: CustomerRole;
  status: CustomerStatus;
  source?: CustomerSource;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  country?: string;
  firstPurchaseAt?: string;
  lastPurchaseAt?: string;
  createdAt: string;
  lastLoginAt: string;
  updatedAt: string;
};

export type PurchaseCustomer = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  googleId?: string | null;
  role: CustomerRole;
  status: CustomerStatus;
  source: CustomerSource;
  address1?: string;
  address2?: string;
  city?: string;
  region?: string;
  country?: string;
  firstPurchaseAt?: string;
  lastPurchaseAt?: string;
  createdAt: string;
  updatedAt: string;
};

function getServerClient() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
  const token = process.env.SANITY_API_WRITE_TOKEN;

  if (!projectId) throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID is missing.");
  if (!token) throw new Error("SANITY_API_WRITE_TOKEN is missing.");

  return createClient({
    projectId,
    dataset,
    apiVersion: "2026-08-27",
    useCdn: false,
    token,
    perspective: "raw",
  });
}

function safeDocumentPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "");
}

function baseDocumentId(value: string) {
  return value.replace(/^drafts\./, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function guestDocumentId(email: string) {
  const hash = createHash("sha256")
    .update(normalizeEmail(email))
    .digest("hex")
    .slice(0, 32);

  return `customerUser.guest.${hash}`;
}

export function customerDocumentId(googleId: string) {
  return `customerUser.google.${safeDocumentPart(googleId)}`;
}

async function findCustomerByIdentity({
  email,
  googleId,
}: {
  email: string;
  googleId?: string;
}) {
  const client = getServerClient();
  const normalizedEmail = normalizeEmail(email);

  return client.fetch<{ _id: string; googleId?: string | null } | null>(
    `*[
      _type == "customerUser" &&
      (email == $email || ($googleId != "" && googleId == $googleId))
    ] | order(_updatedAt desc)[0]{ _id, googleId }`,
    { email: normalizedEmail, googleId: googleId || "" },
  );
}

export async function ensureGoogleCustomer({
  googleId,
  name,
  email,
  image,
}: {
  googleId: string;
  name: string;
  email: string;
  image?: string | null;
}): Promise<SanityCustomer> {
  const client = getServerClient();
  const normalizedEmail = normalizeEmail(email);
  const existing = await findCustomerByIdentity({ email: normalizedEmail, googleId });
  const documentId = existing ? baseDocumentId(existing._id) : customerDocumentId(googleId);
  const now = new Date().toISOString();

  await client.createIfNotExists({
    _id: documentId,
    _type: "customerUser",
    googleId,
    name,
    email: normalizedEmail,
    image: image || null,
    role: "CUSTOMER",
    status: "ACTIVE",
    source: "GOOGLE",
    createdAt: now,
    lastLoginAt: now,
    updatedAt: now,
  });

  await client
    .patch(documentId)
    .set({
      googleId,
      name,
      email: normalizedEmail,
      image: image || null,
      lastLoginAt: now,
      updatedAt: now,
    })
    .setIfMissing({
      role: "CUSTOMER",
      status: "ACTIVE",
      source: "GOOGLE",
      createdAt: now,
    })
    .commit();

  const customer = await getGoogleCustomer(googleId);
  if (!customer) throw new Error("Customer was created but could not be retrieved.");
  return customer;
}

/**
 * Persist the buyer profile after a VERIFIED order/payment.
 * Call this only from the server-side Paystack verification/webhook flow.
 * Never use it to store card data. The commerceOrder must keep its own
 * immutable name/email/phone/address snapshot for historical accuracy.
 */
export async function upsertCustomerFromPurchase({
  customerId,
  name,
  email,
  phone,
  address1,
  address2,
  city,
  region,
  country = "Kenya",
  purchasedAt = new Date().toISOString(),
}: {
  customerId?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  purchasedAt?: string;
}): Promise<PurchaseCustomer> {
  const client = getServerClient();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Customer email is required.");

  let documentId = customerId ? baseDocumentId(customerId) : "";
  if (!documentId) {
    const existing = await findCustomerByIdentity({ email: normalizedEmail });
    documentId = existing ? baseDocumentId(existing._id) : guestDocumentId(normalizedEmail);
  }

  const now = new Date().toISOString();
  const contact = {
    phone: normalizeOptional(phone),
    address1: normalizeOptional(address1),
    address2: normalizeOptional(address2),
    city: normalizeOptional(city),
    region: normalizeOptional(region),
    country: normalizeOptional(country),
  };
  const set: Record<string, unknown> = {
    name: name.trim() || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    lastPurchaseAt: purchasedAt,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(contact)) {
    if (value !== undefined) set[key] = value;
  }

  await client.createIfNotExists({
    _id: documentId,
    _type: "customerUser",
    name: name.trim() || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    role: "CUSTOMER",
    status: "ACTIVE",
    source: "GUEST_CHECKOUT",
    firstPurchaseAt: purchasedAt,
    lastPurchaseAt: purchasedAt,
    createdAt: now,
    updatedAt: now,
    ...Object.fromEntries(Object.entries(contact).filter(([, value]) => value !== undefined)),
  });

  await client
    .patch(documentId)
    .set(set)
    .setIfMissing({
      role: "CUSTOMER",
      status: "ACTIVE",
      source: "GUEST_CHECKOUT",
      firstPurchaseAt: purchasedAt,
      createdAt: now,
    })
    .commit();

  const customer = await client.fetch<PurchaseCustomer | null>(
    `*[_id == $documentId][0]{
      _id,name,email,phone,googleId,role,status,source,address1,address2,
      city,region,country,firstPurchaseAt,lastPurchaseAt,createdAt,updatedAt
    }`,
    { documentId },
  );
  if (!customer) throw new Error("Purchase customer could not be persisted.");
  return customer;
}

export async function getGoogleCustomer(googleId: string): Promise<SanityCustomer | null> {
  const client = getServerClient();
  return client.fetch<SanityCustomer | null>(
    `*[_type == "customerUser" && googleId == $googleId] | order(_updatedAt desc)[0]{
      _id,name,email,image,googleId,role,status,source,phone,address1,address2,
      city,region,country,firstPurchaseAt,lastPurchaseAt,createdAt,lastLoginAt,updatedAt
    }`,
    { googleId },
  );
}

export async function getCustomerByDocumentId(documentId: string): Promise<SanityCustomer | null> {
  const client = getServerClient();
  const baseId = baseDocumentId(documentId);
  return client.fetch<SanityCustomer | null>(
    `*[_type == "customerUser" && (_id == $baseId || _id == $draftId)]
      | order(_updatedAt desc)[0]{
        _id,name,email,image,googleId,role,status,source,phone,address1,address2,
        city,region,country,firstPurchaseAt,lastPurchaseAt,createdAt,lastLoginAt,updatedAt
      }`,
    { baseId, draftId: `drafts.${baseId}` },
  );
}
