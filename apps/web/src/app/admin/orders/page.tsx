"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { adminApi, ORDER_STATUSES } from "@/lib/admin";
import { inr } from "@/lib/format";
import type { Order } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  function load(status?: string) {
    setLoading(true);
    adminApi
      .orders(status)
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(filter || undefined);
  }, [filter]);

  async function changeStatus(id: string, status: string) {
    setSavingId(id);
    try {
      const updated = await adminApi.setOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch {
      alert("Failed to update status");
    } finally {
      setSavingId(null);
    }
  }

  async function removeOrder(id: string) {
    if (!confirm(`Delete order ${id} permanently? This cannot be undone.`)) return;
    setSavingId(id);
    try {
      await adminApi.deleteOrder(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete order");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-deep">Orders</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border-2 border-brand-borderAccent bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand-primary"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid h-64 place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-8 text-center text-slate-mutedText">
          No orders found.
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-400">{o.id}</p>
                  <p className="font-bold text-slate-deep">{o.customer.name}</p>
                  <p className="text-sm text-slate-mutedText">
                    {o.customer.email} · {o.customer.phone}
                  </p>
                  {o.customer.city && (
                    <p className="text-sm text-slate-mutedText">
                      {o.customer.address1}, {o.customer.city},{" "}
                      {o.customer.state} {o.customer.pincode}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-slate-deep">
                    {inr(o.total)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    {savingId === o.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {o.items.map((i) => (
                  <span
                    key={i.id}
                    className="rounded-lg bg-brand-lilac/60 px-2.5 py-1 text-xs font-semibold text-slate-deep"
                  >
                    {i.storyTitle} · {i.childName} · {i.format} ×{i.quantity}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-mutedText">
                  Update status:
                </span>
                {ORDER_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeStatus(o.id, s)}
                    disabled={o.status === s}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize transition ${
                      o.status === s
                        ? "cursor-default bg-brand-primary text-white"
                        : "border border-brand-borderAccent text-slate-mutedText hover:border-brand-primary hover:text-brand-primary"
                    }`}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
                <button
                  onClick={() => removeOrder(o.id)}
                  disabled={savingId === o.id}
                  title="Delete order permanently"
                  aria-label={`Delete order ${o.id}`}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-500 transition hover:border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
