import "server-only";

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { serverClient } from "@/sanity/lib/serverClient";
import type { CustomerRole, CustomerStatus } from "@/lib/auth/sanity-users";

function deriveKey(password: string, salt: Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const RESET_TTL_MS = 30 * 60 * 1000;

type PasswordCustomer = {
  _id: string;
  name: string;
  email: string;
  role: CustomerRole;
  status: CustomerStatus;
  passwordHash?: string;
};

export type PasswordAuthCustomer = Omit<PasswordCustomer, "passwordHash">;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function emailDocumentId(email: string) {
  const hash = createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
  return `customerUser.email.${hash}`;
}

function resetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`);
  }
  if (!/\d/.test(password)) {
    throw new Error("Password must include at least one number.");
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    throw new Error("Password must include at least one special character.");
  }
}

export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, saltText, hashText] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;

  try {
    const salt = Buffer.from(saltText, "base64");
    const expected = Buffer.from(hashText, "base64");
    const actual = await deriveKey(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function customerByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return serverClient.fetch<PasswordCustomer | null>(
    `*[_type == "customerUser" && lower(email) == $email] | order(_updatedAt desc)[0]{
      _id,name,email,role,status,passwordHash
    }`,
    { email: normalizedEmail },
    { cache: "no-store" },
  );
}

export async function authenticatePasswordCustomer(email: string, password: string): Promise<PasswordAuthCustomer | null> {
  const customer = await customerByEmail(email);
  if (!customer?.passwordHash || customer.status !== "ACTIVE") return null;
  if (!(await verifyPassword(password, customer.passwordHash))) return null;

  const now = new Date().toISOString();
  await serverClient.patch(customer._id.replace(/^drafts\./, "")).set({ lastLoginAt: now, updatedAt: now }).commit();

  const { passwordHash: _passwordHash, ...safeCustomer } = customer;
  return safeCustomer;
}

export async function registerPasswordCustomer(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<PasswordAuthCustomer> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);

  if (name.length < 2) throw new Error("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.password !== input.confirmPassword) throw new Error("Passwords do not match.");
  validatePassword(input.password);

  const existing = await customerByEmail(email);
  if (existing?.role && existing.role !== "CUSTOMER") {
    throw new Error("A staff account already uses this email. Use Forgot password to create or reset its password.");
  }
  if (existing?.passwordHash) {
    throw new Error("An account already exists for this email. Sign in or use Forgot password.");
  }
  if (existing?.status === "SUSPENDED") throw new Error("This account is suspended.");

  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  const documentId = existing?._id.replace(/^drafts\./, "") || emailDocumentId(email);

  if (existing) {
    await serverClient.patch(documentId).set({
      name,
      passwordHash,
      passwordUpdatedAt: now,
      updatedAt: now,
    }).setIfMissing({
      role: "CUSTOMER",
      status: "ACTIVE",
      source: "EMAIL_PASSWORD",
      createdAt: now,
    }).commit();
  } else {
    await serverClient.create({
      _id: documentId,
      _type: "customerUser",
      name,
      email,
      role: "CUSTOMER",
      status: "ACTIVE",
      source: "EMAIL_PASSWORD",
      passwordHash,
      passwordUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { _id: documentId, name, email, role: "CUSTOMER", status: "ACTIVE" };
}

export async function createPasswordReset(email: string) {
  const customer = await customerByEmail(email);
  if (!customer || customer.status !== "ACTIVE") return null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await serverClient.patch(customer._id.replace(/^drafts\./, "")).set({
    passwordResetTokenHash: resetTokenHash(token),
    passwordResetExpiresAt: expiresAt,
    updatedAt: new Date().toISOString(),
  }).commit();

  return { token, email: customer.email, name: customer.name, expiresAt };
}

export async function resetPassword(input: {
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
}) {
  const email = normalizeEmail(input.email);
  if (input.password !== input.confirmPassword) throw new Error("Passwords do not match.");
  validatePassword(input.password);

  const tokenHash = resetTokenHash(input.token.trim());
  const now = new Date().toISOString();
  const customer = await serverClient.fetch<{ _id: string; status?: CustomerStatus } | null>(
    `*[_type == "customerUser" && lower(email) == $email && passwordResetTokenHash == $tokenHash && dateTime(passwordResetExpiresAt) > dateTime($now)][0]{_id,status}`,
    { email, tokenHash, now },
    { cache: "no-store" },
  );

  if (!customer || customer.status === "SUSPENDED") {
    throw new Error("This password reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(input.password);
  await serverClient.patch(customer._id.replace(/^drafts\./, "")).set({
    passwordHash,
    passwordUpdatedAt: now,
    updatedAt: now,
  }).unset(["passwordResetTokenHash", "passwordResetExpiresAt"]).commit();
}

export async function getPasswordState(customerId: string) {
  const id = customerId.replace(/^drafts\./, "");
  const result = await serverClient.fetch<{ hasPassword: boolean } | null>(
    `*[_type == "customerUser" && _id == $id][0]{"hasPassword": defined(passwordHash)}`,
    { id },
    { cache: "no-store" },
  );
  return { hasPassword: result?.hasPassword === true };
}

export async function changePassword(input: {
  customerId: string;
  currentPassword?: string;
  password: string;
  confirmPassword: string;
}) {
  if (input.password !== input.confirmPassword) throw new Error("New passwords do not match.");
  validatePassword(input.password);

  const id = input.customerId.replace(/^drafts\./, "");
  const customer = await serverClient.fetch<{ passwordHash?: string; status?: CustomerStatus } | null>(
    `*[_type == "customerUser" && _id == $id][0]{passwordHash,status}`,
    { id },
    { cache: "no-store" },
  );
  if (!customer || customer.status !== "ACTIVE") throw new Error("Account is unavailable.");

  if (customer.passwordHash) {
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, customer.passwordHash))) {
      throw new Error("Current password is incorrect.");
    }
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  await serverClient.patch(id).set({ passwordHash, passwordUpdatedAt: now, updatedAt: now }).unset([
    "passwordResetTokenHash",
    "passwordResetExpiresAt",
  ]).commit();
}
