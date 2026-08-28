"use client";

import { useCallback, useEffect, useState } from "react";

import type { BackofficeNotifications, OperationsSnapshot } from "./types";

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


export function useBackofficeNotifications(pollMs = 30000) {
  const [notifications, setNotifications] = useState<BackofficeNotifications>({
    newOrders: 0,
    deliveries: 0,
    restockRequests: 0,
  });

  const refreshNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/backoffice/notifications", {
        cache: "no-store",
      });

      if (!response.ok) return;

      const payload = (await response.json()) as BackofficeNotifications;
      setNotifications(payload);
    } catch {
      // Navigation alerts are supplementary; a temporary polling failure should
      // never block staff from using the back-office.
    }
  }, []);

  useEffect(() => {
    void refreshNotifications();

    const timer = window.setInterval(() => {
      void refreshNotifications();
    }, pollMs);

    return () => window.clearInterval(timer);
  }, [pollMs, refreshNotifications]);

  return { notifications, refreshNotifications };
}
