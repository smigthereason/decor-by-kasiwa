"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ShoppingBag,
  TrendingUp,
  Clock,
  Package,
} from "lucide-react";

import StatusPill from "@/components/backoffice/StatusPill";
import { customers, orders } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminCustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;

  const customer = customers.find((item) => item.id === customerId);
  const customerOrders = orders.filter((order) => order.customerEmail === customer?.email);

  if (!customer) notFound();

  const totalSpent = customerOrders.reduce((sum, order) => sum + order.total, 0);
  const averageOrder = totalSpent / Math.max(customerOrders.length, 1);

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/admin/customers"
              className="group mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
              Back to customers
            </Link>
            <p className="kicker text-[var(--muted)]">Customer</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.03em] sm:text-3xl lg:text-4xl">
              {customer.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-full bg-[var(--ink)] text-lg font-semibold text-white">
              {customer.name.split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1.5fr] lg:p-8">
        {/* LEFT: CONTACT INFO & STATS */}
        <div className="space-y-4">
          {/* Contact Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Contact Information</p>
            <div className="mt-4 space-y-3">
              <p className="flex items-center gap-3 text-sm">
                <Mail size={15} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
                {customer.email}
              </p>
              <p className="flex items-center gap-3 text-sm">
                <Phone size={15} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
                {customer.phone}
              </p>
              <p className="flex items-center gap-3 text-sm">
                <MapPin size={15} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
                {customer.location}
              </p>
            </div>
          </div>

          {/* Stats Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Customer Stats</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between border-b hairline pb-3">
                <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <ShoppingBag size={14} />
                  Total Orders
                </span>
                <span className="text-sm font-semibold">{customer.orders}</span>
              </div>
              <div className="flex items-center justify-between border-b hairline pb-3">
                <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <TrendingUp size={14} />
                  Lifetime Value
                </span>
                <span className="text-sm font-semibold">{formatKes(customer.lifetimeValue)}</span>
              </div>
              <div className="flex items-center justify-between border-b hairline pb-3">
                <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Clock size={14} />
                  Average Order
                </span>
                <span className="text-sm font-semibold">{formatKes(averageOrder)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Package size={14} />
                  Last Order
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {formatDateTime(customer.lastOrderAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: ORDER HISTORY */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <p className="kicker text-[var(--muted)]">Order History</p>

          {customerOrders.length > 0 ? (
            <div className="mt-4 space-y-3">
              {customerOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="group flex flex-col gap-3 rounded-lg border hairline p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)]">
                      <Package size={16} className="text-[var(--muted)]" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold group-hover:underline underline-offset-4">
                        {order.orderNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <StatusPill value={order.status} />
                    <span className="text-sm font-semibold">
                      {formatKes(order.total)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border hairline bg-[var(--paper-2)] p-8 text-center">
              <Package size={24} className="mx-auto text-[var(--muted)]" />
              <p className="mt-3 text-sm font-medium">No orders found</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                This customer has no order history yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
