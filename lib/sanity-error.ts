type SanityServiceError = {
  message: string;
  status: number;
};

function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return "";
}

export function toSanityServiceError(
  cause: unknown,
  fallbackMessage: string,
): SanityServiceError {
  const message = errorText(cause);
  const normalized = message.toLowerCase();

  const isUnauthorized =
    normalized.includes("http 401") ||
    normalized.includes("401 unauthorized") ||
    normalized.includes("statuscode: 401") ||
    normalized.includes('statuscode":401');

  const isForbidden =
    normalized.includes("http 403") ||
    normalized.includes("403 forbidden") ||
    normalized.includes("statuscode: 403") ||
    normalized.includes('statuscode":403');

  if (isUnauthorized || isForbidden) {
    return {
      status: 503,
      message:
        "Catalogue updates are temporarily unavailable because the server does not have Sanity write permission. Please contact an administrator.",
    };
  }

  return {
    status: 500,
    message: fallbackMessage,
  };
}
