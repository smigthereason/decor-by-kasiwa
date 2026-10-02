"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, PackageCheck, RefreshCcw, Search, UserCheck, X } from "lucide-react";
import { formatMoney } from "@/lib/money";

type Stage = "PRODUCTION" | "PACKAGING" | "DELIVERY";
type Job = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  deliveryLocation?: string;
  salesChannel: string;
  status: string;
  paymentStatus: string;
  total: number;
  amountPaid: number;
  fulfilmentStages: Stage[];
  currentFulfilmentStage: Stage;
  assignedStaffId?: string;
  assignedFulfilmentStaffName?: string;
  items: Array<{ name: string; category?: string; quantity: number; image?: string }>;
};
type Staff = { _id: string; name: string; email: string; role: string; permissions?: string[] };
type Viewer = { role: string; customerId: string; stages: Stage[]; manager: boolean };

const roleFor: Record<Stage, string> = {
  PRODUCTION: "PRODUCTION_STAFF",
  PACKAGING: "PACKAGING_STAFF",
  DELIVERY: "DELIVERY_STAFF",
};
const permissionFor: Record<Stage, string> = {
  PRODUCTION: "PRODUCTION",
  PACKAGING: "PACKAGING",
  DELIVERY: "DELIVERY",
};
const order: Stage[] = ["PRODUCTION", "PACKAGING", "DELIVERY"];
const stageLabel = (stage: Stage) => stage[0] + stage.slice(1).toLowerCase();

export default function FulfilmentWorkflowPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [currentAssignments, setCurrentAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backoffice/workflow", { cache: "no-store" });
      const payload = await response.json() as { orders?: Job[]; availableStaff?: Staff[]; viewer?: Viewer; message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to load workflow.");
      setJobs(payload.orders || []);
      setStaff(payload.availableStaff || []);
      setViewer(payload.viewer || null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to load workflow.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function nextStage(job: Job) {
    const index = order.indexOf(job.currentFulfilmentStage);
    return order.slice(index + 1).find((stage) => job.fulfilmentStages.includes(stage));
  }

  function candidates(stage: Stage | undefined) {
    if (!stage) return [];
    return staff.filter((item) => item.role === roleFor[stage] || item.permissions?.includes(permissionFor[stage]));
  }

  async function assignCurrent(job: Job) {
    const staffId = currentAssignments[job.id];
    if (!staffId) {
      setMessage(`Select an available ${stageLabel(job.currentFulfilmentStage).toLowerCase()} staff member first.`);
      return;
    }
    setSaving(`assign-${job.id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/backoffice/workflow/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_current", staffId }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to assign workflow job.");
      setMessage(`${job.orderNumber} assigned to ${stageLabel(job.currentFulfilmentStage).toLowerCase()}.`);
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to assign workflow job.");
    } finally {
      setSaving("");
    }
  }

  async function complete(job: Job) {
    const next = nextStage(job);
    if (next && !assignments[job.id]) {
      setMessage(`Select an available ${next.toLowerCase()} staff member first.`);
      return;
    }
    setSaving(job.id);
    setMessage("");
    try {
      const response = await fetch(`/api/backoffice/workflow/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextStaffId: next ? assignments[job.id] : undefined }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to complete stage.");
      setMessage(next ? `${job.currentFulfilmentStage.toLowerCase()} completed and assigned to ${next.toLowerCase()}.` : "Final workflow stage completed.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to complete workflow stage.");
    } finally {
      setSaving("");
    }
  }

  const visibleStages = viewer?.manager ? order : order.filter((stage) => viewer?.stages?.includes(stage));
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const grouped = useMemo(
    () => visibleStages.map((stage) => ({
      stage,
      jobs: jobs.filter((job) =>
        job.currentFulfilmentStage === stage &&
        (!normalizedOrderSearch || job.orderNumber.toLowerCase().includes(normalizedOrderSearch)),
      ),
    })),
    [jobs, normalizedOrderSearch, visibleStages.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const matchedJobs = grouped.reduce((total, group) => total + group.jobs.length, 0);

  return (
    <div className="min-h-full bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="kicker text-[var(--muted)]">Operations</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Fulfilment Workflow</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Production, packaging and delivery move forward only after the active team completes its stage and assigns the next available staff member.
            </p>
          </div>
          <button onClick={() => void load()} className="inline-flex min-h-10 w-fit shrink-0 items-center gap-2 rounded-full border hairline bg-white px-4 py-2 text-xs">
            <RefreshCcw size={14} />Refresh
          </button>
        </div>

        <div className="mt-5 rounded-2xl border hairline bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <UserCheck size={18} className="mt-0.5 shrink-0 text-[var(--brand-green)]" />
            <div>
              <p className="text-xs font-semibold">How a workflow starts</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                {viewer?.manager
                  ? "A paid POS or online sale enters this queue automatically when its product category has fulfilment stages. Assign the first active stage to a staff member; after that, each team completes its stage and assigns the next team."
                  : "A paid sale enters the workflow automatically. A manager assigns the first required stage, and only jobs assigned to you appear here. Complete your stage, then assign the next required team when prompted."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border hairline bg-white p-4 sm:p-5">
          <label htmlFor="fulfilment-order-search" className="text-xs font-semibold">Find an order</label>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Search the active fulfilment queue by order number.</p>
          <div className="relative mt-3">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id="fulfilment-order-search"
              type="search"
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder="Search e.g. DBK-COM-1234-2026"
              autoComplete="off"
              className="min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] py-3 pl-11 pr-12 text-sm outline-none transition focus:border-[var(--brand-green)]"
            />
            {orderSearch && (
              <button
                type="button"
                onClick={() => setOrderSearch("")}
                aria-label="Clear order search"
                className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {normalizedOrderSearch && (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              {matchedJobs === 0 ? "No active fulfilment order matches this order number." : `${matchedJobs} matching ${matchedJobs === 1 ? "order" : "orders"}`}
            </p>
          )}
        </div>

        {message && <p className="mt-5 break-words rounded-xl border hairline bg-white p-3 text-xs">{message}</p>}

        {loading ? (
          <div className="mt-8"><LoaderCircle className="animate-spin" /></div>
        ) : grouped.length === 0 ? (
          <div className="mt-6 rounded-2xl border hairline bg-white p-6 text-sm text-[var(--muted)]">No fulfilment stages are assigned to this account.</div>
        ) : (
          <div className={`mt-6 grid gap-4 sm:gap-5 ${grouped.length === 1 ? "grid-cols-1" : "md:grid-cols-2 2xl:grid-cols-3"}`}>
            {grouped.map((group) => (
              <section key={group.stage} className="min-w-0 rounded-2xl border hairline bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold"><PackageCheck size={16} className="shrink-0" />{stageLabel(group.stage)}</h2>
                  <span className="shrink-0 rounded-full bg-[var(--brand-green)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--brand-green)]">{group.jobs.length}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {group.jobs.length === 0 ? (
                    <p className="rounded-xl bg-[var(--paper)] p-4 text-xs text-[var(--muted)]">No jobs waiting.</p>
                  ) : group.jobs.map((job) => {
                    const next = nextStage(job);
                    const nextOptions = candidates(next);
                    const currentOptions = candidates(job.currentFulfilmentStage);
                    const needsInitialAssignment = viewer?.manager && !job.assignedStaffId;
                    return (
                      <article key={job.id} className="min-w-0 rounded-xl border hairline bg-[var(--paper)] p-3.5 sm:p-4">
                        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold">{job.orderNumber}</p>
                            <p className="mt-1 break-words text-[11px] text-[var(--muted)]">{job.customerName} · {job.salesChannel}</p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold">{formatMoney(job.total)}</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {job.items.map((item, itemIndex) => (
                            <div key={`${job.id}-${itemIndex}-${item.name}`} className="flex items-center gap-3 rounded-lg border hairline bg-white p-2">
                              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[var(--paper-2)]">
                                {item.image ? (
                                  <Image src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase text-[var(--muted)]">No image</div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold leading-5">{item.quantity}× {item.name}</p>
                                {item.category && <p className="mt-0.5 text-[10px] text-[var(--muted)]">{item.category}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                        {job.assignedFulfilmentStaffName && <p className="mt-2 break-words text-[10px] font-semibold uppercase tracking-wide">Assigned: {job.assignedFulfilmentStaffName}</p>}

                        {needsInitialAssignment ? (
                          <div className="mt-3 grid gap-2">
                            <select
                              value={currentAssignments[job.id] || ""}
                              onChange={(event) => setCurrentAssignments((current) => ({ ...current, [job.id]: event.target.value }))}
                              className="min-h-11 w-full min-w-0 rounded-lg border hairline bg-white px-3 text-xs"
                            >
                              <option value="">Assign {stageLabel(job.currentFulfilmentStage).toLowerCase()} staff</option>
                              {currentOptions.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}
                            </select>
                            <button
                              disabled={saving === `assign-${job.id}`}
                              onClick={() => void assignCurrent(job)}
                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-green)] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {saving === `assign-${job.id}` ? <LoaderCircle size={14} className="animate-spin" /> : <UserCheck size={14} />}
                              Assign first stage
                            </button>
                          </div>
                        ) : (
                          <>
                            {next && (
                              <select
                                value={assignments[job.id] || ""}
                                onChange={(event) => setAssignments((current) => ({ ...current, [job.id]: event.target.value }))}
                                className="mt-3 min-h-11 w-full min-w-0 rounded-lg border hairline bg-white px-3 text-xs"
                              >
                                <option value="">Assign next: {next.toLowerCase()}</option>
                                {nextOptions.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}
                              </select>
                            )}
                            <button
                              disabled={saving === job.id}
                              onClick={() => void complete(job)}
                              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-green)] px-3 py-2.5 text-center text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {saving === job.id ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              <span>{next ? `Complete & send to ${next.toLowerCase()}` : "Mark stage complete"}</span>
                            </button>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
