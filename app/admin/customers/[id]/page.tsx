"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import OrderTable from "@/components/backoffice/OrderTable";
import StatusPill from "@/components/backoffice/StatusPill";

import {
  mutateBackoffice,
  useLiveOperations,
} from "@/lib/operations/client";

import { formatKes } from "@/lib/operations/selectors";

import type {
  CustomerRole,
  CustomerStatus,
} from "@/lib/auth/sanity-users";

type FormState = {
  name: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  country: string;
  role: CustomerRole;
  status: CustomerStatus;
};

export default function AdminCustomerDetailPage() {
  const params = useParams<{
    id: string;
  }>();

  const id = decodeURIComponent(
    params.id,
  );

  const {
    data,
    loading,
    error,
    refresh,
  } = useLiveOperations();

  const customer =
    data?.customers.find(
      (item) => item.id === id,
    );

  const [form, setForm] =
    useState<FormState | null>(
      null,
    );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    saveError,
    setSaveError,
  ] = useState("");

  /*
   * Keep the editable form synchronised with
   * the latest live customer returned from Sanity.
   */
  useEffect(() => {
    if (!customer) {
      return;
    }

    setForm({
      name:
        customer.name || "",
      phone:
        customer.phone === "—"
          ? ""
          : customer.phone || "",
      address1:
        customer.address1 ||
        "",
      address2:
        customer.address2 ||
        "",
      city:
        customer.city || "",
      region:
        customer.region || "",
      country:
        customer.country ||
        "Kenya",
      role:
        customer.role ||
        "CUSTOMER",
      status:
        customer.status ||
        "ACTIVE",
    });
  }, [customer]);

  /*
   * Save customer changes back to the same
   * customerUser document in Sanity.
   *
   * We deliberately guard customer + form
   * again inside this async function because
   * TypeScript does not retain the component-level
   * narrowing inside async closures.
   */
  async function save() {
    if (
      !customer ||
      !form ||
      saving
    ) {
      return;
    }

    const customerId =
      customer.id;

    const payload: Record<
      string,
      unknown
    > = {
      name: form.name,
      phone: form.phone,
      address1:
        form.address1,
      address2:
        form.address2,
      city: form.city,
      region: form.region,
      country: form.country,
      role: form.role,
      status: form.status,
    };

    setSaving(true);
    setMessage("");
    setSaveError("");

    try {
      await mutateBackoffice(
        `/api/backoffice/customers/${encodeURIComponent(
          customerId,
        )}`,
        payload,
      );

      await refresh();

      setMessage(
        "Customer profile updated in Sanity.",
      );
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Customer update failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * Loading / API error state.
   */
  if (!data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <LiveDataState
          loading={loading}
          error={error}
          onRetry={refresh}
        />
      </div>
    );
  }

  /*
   * Customer does not exist, or the editable
   * form has not yet been initialised.
   */
  if (
    !customer ||
    !form
  ) {
    return (
      <div className="p-6">
        <Link
          href="/admin/customers"
          className="underline"
        >
          Back to customers
        </Link>

        <p className="mt-8 text-sm text-[var(--muted)]">
          Live customer not
          found.
        </p>
      </div>
    );
  }

  /*
   * Orders are linked by email so this works for:
   *
   * - authenticated Google customers
   * - guest checkout customers
   * - customers who bought as guests and later signed in
   */
  const customerOrders =
    data.orders.filter(
      (order) =>
        order.customerEmail
          .toLowerCase()
          .trim() ===
        customer.email
          .toLowerCase()
          .trim(),
    );

  const location = [
    form.address1,
    form.city,
    form.region,
    form.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* ================================================================ */}
      {/* CUSTOMER HEADER                                                  */}
      {/* ================================================================ */}

      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
        >
          <ArrowLeft
            size={13}
          />

          Back to customers
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-[-0.04em]">
              {
                customer.name
              }
            </h1>

            <p className="mt-2 text-sm text-[var(--muted)]">
              {
                customer.email
              }
            </p>

            <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
              {customer.authenticated
                ? "Google account"
                : "Guest purchaser"}

              {" · "}

              {customer.source ===
              "GUEST_CHECKOUT"
                ? "Captured at checkout"
                : "Customer profile"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusPill
              value={(
                customer.status ||
                "ACTIVE"
              ).toLowerCase()}
            />

            <StatusPill
              value={(
                customer.role ||
                "CUSTOMER"
              ).toLowerCase()}
            />
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* CUSTOMER CONTENT                                                 */}
      {/* ================================================================ */}

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[0.85fr_1.5fr] lg:p-8">
        {/* ============================================================= */}
        {/* LEFT COLUMN                                                  */}
        {/* ============================================================= */}

        <aside className="space-y-4">
          {/* ----------------------------------------------------------- */}
          {/* CONTACT                                                     */}
          {/* ----------------------------------------------------------- */}

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <p className="kicker text-[var(--muted)]">
              Contact
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-3">
                <Mail
                  size={15}
                  className="mt-0.5 shrink-0 text-[var(--muted)]"
                />

                <span className="min-w-0 break-all">
                  {
                    customer.email
                  }
                </span>
              </p>

              <p className="flex items-center gap-3">
                <Phone
                  size={15}
                  className="shrink-0 text-[var(--muted)]"
                />

                <span>
                  {form.phone ||
                    "—"}
                </span>
              </p>

              <p className="flex items-start gap-3">
                <MapPin
                  size={15}
                  className="mt-0.5 shrink-0 text-[var(--muted)]"
                />

                <span>
                  {location ||
                    "—"}
                </span>
              </p>
            </div>
          </section>

          {/* ----------------------------------------------------------- */}
          {/* ACCOUNT MANAGEMENT                                         */}
          {/* ----------------------------------------------------------- */}

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={15}
              />

              <p className="kicker text-[var(--muted)]">
                Account
                management
              </p>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              Customer contact
              information, access
              level and account
              status are persisted
              directly to Sanity.
            </p>

            <div className="mt-5 grid gap-4">
              {/* NAME */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Name

                <input
                  value={
                    form.name
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      name:
                        event
                          .target
                          .value,
                    })
                  }
                  autoComplete="name"
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                />
              </label>

              {/* EMAIL — READ ONLY */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Email

                <input
                  value={
                    customer.email
                  }
                  readOnly
                  disabled
                  className="cursor-not-allowed rounded-lg border hairline bg-[var(--paper-2)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--muted)] outline-none"
                />
              </label>

              {/* PHONE */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Phone

                <input
                  type="tel"
                  value={
                    form.phone
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      phone:
                        event
                          .target
                          .value,
                    })
                  }
                  placeholder="+254 7XX XXX XXX"
                  autoComplete="tel"
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                />
              </label>

              {/* ROLE */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Role

                <select
                  value={
                    form.role
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      role: event
                        .target
                        .value as CustomerRole,
                    })
                  }
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                >
                  <option value="CUSTOMER">Customer</option>
                    <option value="STORE_STAFF">Sales Staff / Cashier</option>

                  <option value="STORE">Store Manager</option>

                  <option value="ADMIN">Admin / Store Owner</option>
                </select>
                              <span className="text-[10px] font-normal normal-case leading-relaxed tracking-normal text-[var(--muted)]">
                  Sales Staff can search inventory, receive dispatched deliveries and raise restock alerts. Store Manager handles orders, products, inventory, shipments and dispatch. Admin is the store owner with full access.
                </span>
</label>

              {/* STATUS */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Status

                <select
                  value={
                    form.status
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      status:
                        event
                          .target
                          .value as CustomerStatus,
                    })
                  }
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                >
                  <option value="ACTIVE">
                    Active
                  </option>

                  <option value="SUSPENDED">
                    Suspended
                  </option>
                </select>
              </label>

              {/* ADDRESS 1 */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Address line 1

                <input
                  value={
                    form.address1
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      address1:
                        event
                          .target
                          .value,
                    })
                  }
                  autoComplete="address-line1"
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                />
              </label>

              {/* ADDRESS 2 */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Address line 2

                <input
                  value={
                    form.address2
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      address2:
                        event
                          .target
                          .value,
                    })
                  }
                  autoComplete="address-line2"
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                />
              </label>

              {/* CITY / REGION */}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  City

                  <input
                    value={
                      form.city
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        city:
                          event
                            .target
                            .value,
                      })
                    }
                    autoComplete="address-level2"
                    className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                  />
                </label>

                <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Region

                  <input
                    value={
                      form.region
                    }
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        region:
                          event
                            .target
                            .value,
                      })
                    }
                    placeholder="e.g. Nairobi"
                    autoComplete="address-level1"
                    className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                  />
                </label>
              </div>

              {/* COUNTRY */}

              <label className="grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Country

                <input
                  value={
                    form.country
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm({
                      ...form,
                      country:
                        event
                          .target
                          .value,
                    })
                  }
                  autoComplete="country-name"
                  className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--deep-green)]"
                />
              </label>
            </div>

            {/* FEEDBACK */}

            {(message ||
              saveError) && (
              <p
                className={[
                  "mt-4 rounded-lg px-3 py-2.5 text-xs",
                  saveError
                    ? "bg-red-50 text-red-700"
                    : "bg-[var(--sage-green)]/15 text-[var(--deep-green)]",
                ].join(
                  " ",
                )}
              >
                {message ||
                  saveError}
              </p>
            )}

            {/* SAVE */}

            <button
              type="button"
              onClick={save}
              disabled={
                saving
              }
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {saving ? (
                <LoaderCircle
                  size={13}
                  className="animate-spin"
                />
              ) : (
                <Check
                  size={13}
                />
              )}

              {saving
                ? "Saving"
                : "Save changes"}
            </button>
          </section>

          {/* ----------------------------------------------------------- */}
          {/* COMMERCE                                                    */}
          {/* ----------------------------------------------------------- */}

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <p className="kicker text-[var(--muted)]">
              Commerce
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Orders
                </p>

                <p className="mt-1 text-xl font-semibold">
                  {
                    customer.orders
                  }
                </p>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Lifetime value
                </p>

                <p className="mt-1 text-xl font-semibold">
                  {formatKes(
                    customer.lifetimeValue,
                  )}
                </p>
              </div>
            </div>
          </section>
        </aside>

        {/* ============================================================= */}
        {/* ORDER HISTORY                                                 */}
        {/* ============================================================= */}

        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="kicker text-[var(--muted)]">
                Order history
              </p>

              <p className="mt-2 text-xs text-[var(--muted)]">
                Live purchases
                associated with
                this customer&apos;s
                email address.
              </p>
            </div>

            {customerOrders.length >
              0 && (
              <span className="rounded-full bg-[var(--paper-2)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                {
                  customerOrders.length
                }{" "}
                {customerOrders.length ===
                1
                  ? "order"
                  : "orders"}
              </span>
            )}
          </div>

          <div className="mt-5">
            {customerOrders.length >
            0 ? (
              <OrderTable
                orders={
                  customerOrders
                }
                compact
              />
            ) : (
              <div className="rounded-lg border border-dashed hairline p-10 text-center">
                <p className="text-sm text-[var(--muted)]">
                  No live orders
                  for this customer.
                </p>

                <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-[var(--muted)]/75">
                  Purchases will
                  appear here once a
                  verified checkout is
                  linked to this email
                  address.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
