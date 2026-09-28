import "server-only";

type DarajaEnvironment = "sandbox" | "production";

type DarajaConfig = {
  environment: DarajaEnvironment;
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  partyB: string;
  passkey: string;
  transactionType: "CustomerBuyGoodsOnline" | "CustomerPayBillOnline";
  callbackUrl: string;
};

type DarajaErrorShape = {
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
};

export type DarajaStkPushResponse = DarajaErrorShape & {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
};

export type DarajaStkQueryResponse = DarajaErrorShape & {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
};

export type DarajaStkCallbackPayload = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{
          Name?: string;
          Value?: string | number;
        }>;
      };
    };
  };
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function getEnvironment(): DarajaEnvironment {
  const value = (process.env.MPESA_ENV || "production").trim().toLowerCase();
  if (value !== "sandbox" && value !== "production") {
    throw new Error("MPESA_ENV must be either sandbox or production.");
  }
  return value;
}

function callbackUrl() {
  const explicit = process.env.MPESA_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) throw new Error("MPESA_CALLBACK_URL or NEXT_PUBLIC_SITE_URL is required for Daraja callbacks.");
  return `${siteUrl.replace(/\/+$/, "")}/api/payments/mobile/callback`;
}

function getConfig(): DarajaConfig {
  const environment = getEnvironment();
  const transactionType = (process.env.MPESA_TRANSACTION_TYPE || "CustomerBuyGoodsOnline").trim();
  if (transactionType !== "CustomerBuyGoodsOnline" && transactionType !== "CustomerPayBillOnline") {
    throw new Error("MPESA_TRANSACTION_TYPE must be CustomerBuyGoodsOnline or CustomerPayBillOnline.");
  }

  const shortCode = required("MPESA_SHORTCODE");
  const config: DarajaConfig = {
    environment,
    baseUrl: environment === "sandbox" ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke",
    consumerKey: required("MPESA_CONSUMER_KEY"),
    consumerSecret: required("MPESA_CONSUMER_SECRET"),
    shortCode,
    partyB: process.env.MPESA_PARTY_B?.trim() || shortCode,
    passkey: required("MPESA_PASSKEY"),
    transactionType,
    callbackUrl: callbackUrl(),
  };

  if (environment === "production" && !config.callbackUrl.startsWith("https://")) {
    throw new Error("MPESA_CALLBACK_URL must use HTTPS in production.");
  }

  return config;
}

function kenyaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  type TimestampPart = "year" | "month" | "day" | "hour" | "minute" | "second";
  const value = (type: TimestampPart) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}${value("hour")}${value("minute")}${value("second")}`;
}

async function getAccessToken(config: DarajaConfig) {
  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Basic ${credentials}` },
  });

  const payload = (await response.json()) as { access_token?: string; expires_in?: string; errorCode?: string; errorMessage?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.errorMessage || `Daraja authorization failed with HTTP ${response.status}.`);
  }
  return payload.access_token;
}

async function darajaPost<T>(config: DarajaConfig, path: string, body: Record<string, unknown>): Promise<T> {
  const accessToken = await getAccessToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & DarajaErrorShape;
  if (!response.ok || payload.errorCode) {
    throw new Error(payload.errorMessage || payload.ResponseDescription || `Daraja request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function stkPassword(config: DarajaConfig, timestamp: string) {
  return Buffer.from(`${config.shortCode}${config.passkey}${timestamp}`).toString("base64");
}

export function darajaAccountReference(reference: string) {
  const suffix = reference.replace(/^DBK-POS-/, "").replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return `DBK${suffix}`.slice(0, 12);
}

export async function initiateDarajaStkPush({
  phone,
  amount,
  accountReference,
}: {
  phone: string;
  amount: number;
  accountReference: string;
}) {
  const config = getConfig();
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("M-PESA STK Push requires a positive whole-KES amount.");
  }

  const timestamp = kenyaTimestamp();
  const normalizedPhone = phone.replace(/\D/g, "");
  if (!/^254(?:7|1)\d{8}$/.test(normalizedPhone)) {
    throw new Error("Enter a valid Kenyan Safaricom phone number for M-PESA.");
  }

  const response = await darajaPost<DarajaStkPushResponse>(config, "/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: config.shortCode,
    Password: stkPassword(config, timestamp),
    Timestamp: timestamp,
    TransactionType: config.transactionType,
    Amount: amount,
    PartyA: normalizedPhone,
    PartyB: config.partyB,
    PhoneNumber: normalizedPhone,
    CallBackURL: config.callbackUrl,
    AccountReference: accountReference.slice(0, 12),
    TransactionDesc: "Decor by Kasiwa POS",
  });

  if (response.ResponseCode !== "0" || !response.CheckoutRequestID || !response.MerchantRequestID) {
    throw new Error(response.CustomerMessage || response.ResponseDescription || response.errorMessage || "Safaricom did not accept the STK Push request.");
  }

  return {
    merchantRequestId: response.MerchantRequestID,
    checkoutRequestId: response.CheckoutRequestID,
    customerMessage: response.CustomerMessage || "Enter your M-PESA PIN on the phone prompt.",
    environment: config.environment,
  };
}

export async function queryDarajaStkStatus(checkoutRequestId: string) {
  const config = getConfig();
  const timestamp = kenyaTimestamp();
  return darajaPost<DarajaStkQueryResponse>(config, "/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: config.shortCode,
    Password: stkPassword(config, timestamp),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  });
}

export function callbackMetadata(payload: DarajaStkCallbackPayload) {
  const callback = payload.Body?.stkCallback;
  const items = callback?.CallbackMetadata?.Item || [];
  const values = new Map(items.map((item) => [item.Name || "", item.Value]));

  const amountValue = Number(values.get("Amount"));
  const phoneValue = String(values.get("PhoneNumber") || "").replace(/\D/g, "");
  const receiptValue = String(values.get("MpesaReceiptNumber") || "").trim();
  const transactionDateValue = String(values.get("TransactionDate") || "").replace(/\D/g, "");

  return {
    merchantRequestId: callback?.MerchantRequestID?.trim() || "",
    checkoutRequestId: callback?.CheckoutRequestID?.trim() || "",
    resultCode: Number(callback?.ResultCode ?? -1),
    resultDescription: callback?.ResultDesc?.trim() || "",
    amount: Number.isFinite(amountValue) ? amountValue : undefined,
    phone: /^254(?:7|1)\d{8}$/.test(phoneValue) ? phoneValue : undefined,
    receiptNumber: receiptValue || undefined,
    transactionDate: /^\d{14}$/.test(transactionDateValue) ? transactionDateValue : undefined,
  };
}

export function darajaTransactionDate(value?: string) {
  if (!value || !/^\d{14}$/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  // M-PESA timestamps are Kenya time (UTC+3).
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second)).toISOString();
}
