"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "dbk_staff_activity_session";
const SESSION_REUSE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

type StoredSession = { id: string; lastSeenAt: number };

function newSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as StoredSession;
    if (!parsed.id || !parsed.lastSeenAt || Date.now() - parsed.lastSeenAt > SESSION_REUSE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getTrackedStaffSessionId() {
  const existing = readStoredSession();
  if (existing) return existing.id;
  const next = { id: newSessionId(), lastSeenAt: Date.now() };
  writeStoredSession(next);
  return next.id;
}

function markSessionSeen(sessionId: string) {
  if (typeof window === "undefined") return;
  writeStoredSession({ id: sessionId, lastSeenAt: Date.now() });
}

async function postActivity(body: Record<string, string>, keepalive = false) {
  try {
    await fetch("/api/backoffice/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      keepalive,
    });
  } catch {
    // Activity tracking must never interrupt the user's work.
  }
}

export async function endTrackedStaffActivitySession() {
  if (typeof window === "undefined") return;
  const session = readStoredSession();
  window.localStorage.removeItem(STORAGE_KEY);
  if (!session?.id) return;
  await postActivity({ action: "LOGOUT", sessionId: session.id, route: window.location.pathname }, true);
}

export default function StaffActivityTracker() {
  const pathname = usePathname();
  const sessionId = useRef("");
  const lastInteraction = useRef({ fingerprint: "", at: 0 });

  useEffect(() => {
    sessionId.current = getTrackedStaffSessionId();

    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      markSessionSeen(sessionId.current);
      void postActivity({ action: "HEARTBEAT", sessionId: sessionId.current, route: window.location.pathname });
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, HEARTBEAT_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") heartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!sessionId.current) return;
    markSessionSeen(sessionId.current);
    void postActivity({ action: "PAGE_VIEW", sessionId: sessionId.current, route: pathname });
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (!target || !sessionId.current) return;
      const label = (target.getAttribute("aria-label") || target.getAttribute("title") || target.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      if (!label) return;
      const fingerprint = `${pathname}|${label}`;
      const now = Date.now();
      if (lastInteraction.current.fingerprint === fingerprint && now - lastInteraction.current.at < 1500) return;
      lastInteraction.current = { fingerprint, at: now };
      markSessionSeen(sessionId.current);
      void postActivity({ action: "INTERACTION", sessionId: sessionId.current, route: pathname, label });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    const reported = new Set<string>();
    const report = (label: string, detail: string) => {
      if (!sessionId.current) return;
      const fingerprint = `${label}\n${detail}`.slice(0, 400);
      if (reported.has(fingerprint)) return;
      reported.add(fingerprint);
      void postActivity({
        action: "CLIENT_ERROR",
        sessionId: sessionId.current,
        route: window.location.pathname,
        label: label.slice(0, 160),
        detail: detail.slice(0, 1000),
      });
    };

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await nativeFetch(input, init);
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let url: URL;
      try { url = new URL(rawUrl, window.location.origin); } catch { return response; }
      const sameOriginApi = url.origin === window.location.origin && url.pathname.startsWith("/api/");
      const internalTelemetry = url.pathname === "/api/backoffice/activity" || url.pathname.startsWith("/api/backoffice/developer/");
      if (!sameOriginApi || internalTelemetry) return response;

      if (!response.ok) {
        let developerDetail = "";
        try {
          const payload = await response.clone().json() as { message?: unknown; error?: unknown };
          developerDetail = String(payload.message || payload.error || "");
        } catch { /* response is not JSON */ }
        report(
          `${init?.method || "GET"} ${url.pathname} -> ${response.status}`,
          `${init?.method || "GET"} ${url.pathname}${url.search} returned HTTP ${response.status}${developerDetail ? `: ${developerDetail}` : ""}`,
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return response;
      try {
        const payload = await response.clone().json() as Record<string, unknown>;
        if (!payload || typeof payload !== "object") return response;
        if (response.ok && !("message" in payload)) return response;
        const safePayload = response.ok
          ? { ...payload, ...(typeof payload.message === "string" ? { message: "Success" } : {}) }
          : { ...payload, message: `Error ${response.status}`, error: `Error ${response.status}` };
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(JSON.stringify(safePayload), { status: response.status, statusText: response.statusText, headers });
      } catch {
        return response;
      }
    }) as typeof window.fetch;

    const onError = (event: ErrorEvent) => report("Browser error", `${event.message} at ${event.filename || "unknown"}:${event.lineno || 0}:${event.colno || 0}`);
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : String(event.reason || "Unhandled promise rejection");
      report("Unhandled promise rejection", reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);

    return () => {
      window.fetch = nativeFetch;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  return null;
}
