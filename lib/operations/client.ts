"use client";

import { useCallback, useEffect, useState } from "react";

import type { OperationsSnapshot } from "./types";

export function useLiveOperations() {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/backoffice/overview", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Back-office request failed (${response.status})`);
      }

      const payload = (await response.json()) as OperationsSnapshot;
      setData(payload);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError("Live operational data could not be loaded from Sanity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export async function mutateBackoffice(
  url: string,
  body: Record<string, unknown>,
  method: "PATCH" | "POST" | "DELETE" = "PATCH",
) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof payload?.message === "string"
        ? payload.message
        : `Request failed (${response.status})`,
    );
  }

  return payload;
}
