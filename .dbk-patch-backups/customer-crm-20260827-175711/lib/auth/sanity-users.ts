import { createClient } from "@sanity/client";

export type CustomerRole =
  | "CUSTOMER"
  | "ADMIN"
  | "STORE";

export type CustomerStatus =
  | "ACTIVE"
  | "SUSPENDED";

export type SanityCustomer = {
  _id: string;
  name: string;
  email: string;
  image?: string | null;
  googleId: string;
  role: CustomerRole;
  status: CustomerStatus;
  createdAt: string;
  lastLoginAt: string;
  updatedAt: string;
};

function getServerClient() {
  const projectId =
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;

  const dataset =
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    "production";

  const token =
    process.env.SANITY_API_WRITE_TOKEN;

  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_SANITY_PROJECT_ID is missing.",
    );
  }

  if (!token) {
    throw new Error(
      "SANITY_API_WRITE_TOKEN is missing.",
    );
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: "2026-08-25",
    useCdn: false,
    token,
    perspective: "raw",
  });
}

function safeDocumentPart(value: string) {
  return value.replace(
    /[^a-zA-Z0-9._-]/g,
    "",
  );
}

export function customerDocumentId(
  googleId: string,
) {
  return `customerUser.google.${safeDocumentPart(
    googleId,
  )}`;
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

  const documentId =
    customerDocumentId(googleId);

  const now = new Date().toISOString();

  await client.createIfNotExists({
    _id: documentId,
    _type: "customerUser",

    googleId,

    name,
    email: email.toLowerCase(),

    image: image || null,

    role: "CUSTOMER",
    status: "ACTIVE",

    createdAt: now,
    lastLoginAt: now,
    updatedAt: now,
  });

  await client
    .patch(documentId)
    .set({
      googleId,
      name,
      email: email.toLowerCase(),
      image: image || null,
      lastLoginAt: now,
      updatedAt: now,
    })
    .setIfMissing({
      role: "CUSTOMER",
      status: "ACTIVE",
      createdAt: now,
    })
    .commit();

  const customer =
    await client.fetch<SanityCustomer | null>(
      `*[_id == $documentId][0]{
        _id,
        name,
        email,
        image,
        googleId,
        role,
        status,
        createdAt,
        lastLoginAt,
        updatedAt
      }`,
      {
        documentId,
      },
    );

  if (!customer) {
    throw new Error(
      "Customer was created but could not be retrieved.",
    );
  }

  return customer;
}

export async function getGoogleCustomer(
  googleId: string,
): Promise<SanityCustomer | null> {
  const client = getServerClient();

  const baseId =
    customerDocumentId(
      googleId,
    );

  return client.fetch<SanityCustomer | null>(
    `*[
      _type == "customerUser" &&
      (
        _id == $baseId ||
        _id == $draftId
      )
    ]
    | order(_updatedAt desc)
    [0]{
      _id,
      name,
      email,
      image,
      googleId,
      role,
      status,
      createdAt,
      lastLoginAt,
      updatedAt
    }`,
    {
      baseId,
      draftId: `drafts.${baseId}`,
    },
  );
}

export async function getCustomerByDocumentId(
  documentId: string,
): Promise<SanityCustomer | null> {
  const client = getServerClient();

  const baseId =
    documentId.startsWith(
      "drafts.",
    )
      ? documentId.replace(
          /^drafts\./,
          "",
        )
      : documentId;

  return client.fetch<SanityCustomer | null>(
    `*[
      _type == "customerUser" &&
      (
        _id == $baseId ||
        _id == $draftId
      )
    ]
    | order(_updatedAt desc)
    [0]{
      _id,
      name,
      email,
      image,
      googleId,
      role,
      status,
      createdAt,
      lastLoginAt,
      updatedAt
    }`,
    {
      baseId,
      draftId: `drafts.${baseId}`,
    },
  );
}
