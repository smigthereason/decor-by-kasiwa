type SanityServiceError = {
  message: string;
  status: number;
};

function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return "";
}

function responseDetail(cause: unknown): string {
  if (!cause || typeof cause !== "object") return "";
  const record = cause as {
    responseBody?: unknown;
    details?: unknown;
    response?: { body?: unknown };
  };
  const body = record.responseBody ?? record.details ?? record.response?.body;
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return "";
  }
}

export function toSanityServiceError(
  cause: unknown,
  fallbackMessage: string,
): SanityServiceError {
  const message = errorText(cause);
  const detail = responseDetail(cause);
  const normalized = `${message} ${detail}`.toLowerCase();

  const isPlanLimit =
    normalized.includes("plan_limit_reached") ||
    normalized.includes("statuscode\":402") ||
    normalized.includes("statuscode: 402") ||
    normalized.includes("http 402") ||
    normalized.includes("quota");

  if (isPlanLimit) {
    return {
      status: 402,
      message:
        "Sanity blocked this write because the project hit a Free-plan quota (documents, assets, or API). Upgrade the project or wait for the monthly reset. Studio can still open while API writes are capped.",
    };
  }

  const isUnauthorized =
    normalized.includes("http 401") ||
    normalized.includes("401 unauthorized") ||
    normalized.includes("statuscode: 401") ||
    normalized.includes('statuscode":401');

  const isForbidden =
    normalized.includes("http 403") ||
    normalized.includes("403 forbidden") ||
    normalized.includes("statuscode: 403") ||
    normalized.includes('statuscode":403') ||
    normalized.includes("insufficient permissions");

  if (isUnauthorized || isForbidden) {
    const reason = detail || message;
    return {
      status: 503,
      message:
        "Sanity refused the write. The server token is valid enough to be recognized, but it does not have Editor permission on project g34n810u / production. Create a new API token with the Editor role (not Viewer), set SANITY_API_WRITE_TOKEN on the Production environment, and redeploy. Growth is not required for this. " +
        (reason ? `Sanity said: ${reason}` : ""),
    };
  }

  return {
    status: 500,
    message: detail ? `${fallbackMessage} ${detail}` : fallbackMessage,
  };
}
