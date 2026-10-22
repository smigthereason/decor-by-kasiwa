"use client";

import { useCallback, useEffect, useState } from "react";

import type { BackofficeNotifications, OperationsSnapshot, OperationsView } from "./types";

// Share overlapping reads across mounted back-office pages. These are in-flight
// only (no persistent stock/financial cache): a fresh read is made after the
// previous one completes, and normal mutations remain server-authoritative.
const operationsInFlight = new Map<OperationsView, Promise<OperationsSnapshot>>();

async function loadOperationsSnapshot(view: OperationsView): Promise<OperationsSnapshot> {
  const existing = operationsInFlight.get(view);
  if (existing) return existing;
  const pending = (async () => {
    const response = await fetch(`/api/backoffice/overview?view=${encodeURIComponent(view)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Back-office request failed (${response.status})`);
    return (await response.json()) as OperationsSnapshot;
  })();
  operationsInFlight.set(view, pending);
  void pending.then(
    () => { if (operationsInFlight.get(view) === pending) operationsInFlight.delete(view); },
    () => { if (operationsInFlight.get(view) === pending) operationsInFlight.delete(view); },
  );
  return pending;
}

export function useLiveOperations(view: OperationsView = "all") {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await loadOperationsSnapshot(view);
      setData(payload);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError("Live operational data could not be loaded from Sanity.");
    } finally {
      setLoading(false);
    }
  }, [view]);

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


let notificationsInFlight: Promise<BackofficeNotifications> | null = null;

async function loadNotifications(): Promise<BackofficeNotifications> {
  if (!notificationsInFlight) {
    const pending = (async () => {
      const response = await fetch("/api/backoffice/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error(`Notifications request failed (${response.status})`);
      return (await response.json()) as BackofficeNotifications;
    })();
    notificationsInFlight = pending;
    void pending.then(
      () => { if (notificationsInFlight === pending) notificationsInFlight = null; },
      () => { if (notificationsInFlight === pending) notificationsInFlight = null; },
    );
  }
  return notificationsInFlight;
}

export function useBackofficeNotifications(pollMs = 180000) {
  const [notifications, setNotifications] = useState<BackofficeNotifications>({
    newOrders: 0,
    deliveries: 0,
    restockRequests: 0,
    workflowJobs: 0,
  });

  const refreshNotifications = useCallback(async () => {
    try {
      setNotifications(await loadNotifications());
    } catch {
      // Notifications never block operational navigation.
    }
  }, []);

  useEffect(() => {
    void refreshNotifications();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshNotifications();
    };
    const timer = window.setInterval(refreshWhenVisible, pollMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [pollMs, refreshNotifications]);

  return { notifications, refreshNotifications };
}
