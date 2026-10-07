import "server-only";

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

type GoogleTokenResponse = { access_token?: string; expires_in?: number; token_type?: string; error?: string; error_description?: string };
type MetricHeader = { name?: string };
type DimensionHeader = { name?: string };
type ReportRow = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
type GoogleReport = { dimensionHeaders?: DimensionHeader[]; metricHeaders?: MetricHeader[]; rows?: ReportRow[]; rowCount?: number };

export type WebAnalyticsSummary = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
};

export type WebAnalyticsPage = {
  path: string;
  pageViews: number;
  activeUsers: number;
};

function base64Url(input: string | Buffer) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer.toString("base64url");
}

function analyticsConfig() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!propertyId || !clientEmail || !privateKey) return null;
  return { propertyId, clientEmail, privateKey };
}

export function isGoogleAnalyticsReportingConfigured() {
  return Boolean(analyticsConfig());
}

async function getAccessToken() {
  const config = analyticsConfig();
  if (!config) throw new Error("Google Analytics reporting is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: ANALYTICS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64Url(signer.sign(config.privateKey));
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Unable to authenticate Google Analytics reporting.");
  }
  return body.access_token;
}

async function runReport(body: Record<string, unknown>) {
  const config = analyticsConfig();
  if (!config) throw new Error("Google Analytics reporting is not configured.");
  const token = await getAccessToken();
  const response = await fetch(`${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = (await response.json()) as GoogleReport & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || "Google Analytics report request failed.");
  return result;
}

function metricMap(report: GoogleReport, row: ReportRow | undefined) {
  const values = new Map<string, number>();
  (report.metricHeaders || []).forEach((header, index) => {
    if (!header.name) return;
    values.set(header.name, Number(row?.metricValues?.[index]?.value || 0));
  });
  return values;
}

export async function getWebAnalytics(startDate: string, endDate: string) {
  const dateRanges = [{ startDate, endDate }];
  const [summaryReport, pagesReport] = await Promise.all([
    runReport({
      dateRanges,
      metrics: [
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
      ],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "10",
    }),
  ]);

  const summaryMetrics = metricMap(summaryReport, summaryReport.rows?.[0]);
  const summary: WebAnalyticsSummary = {
    activeUsers: summaryMetrics.get("activeUsers") || 0,
    newUsers: summaryMetrics.get("newUsers") || 0,
    sessions: summaryMetrics.get("sessions") || 0,
    pageViews: summaryMetrics.get("screenPageViews") || 0,
  };

  const pages: WebAnalyticsPage[] = (pagesReport.rows || []).map((row) => {
    const metrics = metricMap(pagesReport, row);
    return {
      path: row.dimensionValues?.[0]?.value || "/",
      pageViews: metrics.get("screenPageViews") || 0,
      activeUsers: metrics.get("activeUsers") || 0,
    };
  });

  return { summary, pages };
}
