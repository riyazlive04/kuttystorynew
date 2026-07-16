"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Package, Sparkles, BookOpen, Loader2 } from "lucide-react";
import { adminApi, type AdminStats } from "@/lib/admin";
import { inr } from "@/lib/format";
import type { Order } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.stats(), adminApi.orders()])
      .then(([s, o]) => {
        setStats(s);
        setOrders(o.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
      </div>
    );
  }

  const cards = [
    {
      label: "Revenue",
      value: inr(stats?.revenue || 0),
      icon: IndianRupee,
      tint: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Paid orders",
      value: `${stats?.paidOrders || 0}`,
      icon: Package,
      tint: "bg-brand-primary/10 text-brand-primary",
    },
    {
      label: "Previews created",
      value: `${stats?.jobs || 0}`,
      icon: Sparkles,
      tint: "bg-amber-50 text-amber-600",
    },
    {
      label: "Live stories",
      value: `${stats?.stories || 0}`,
      icon: BookOpen,
      tint: "bg-pink-50 text-pink-500",
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-deep">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${c.tint}`}>
              <c.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-2xl font-extrabold text-slate-deep">
              {c.value}
            </p>
            <p className="text-sm text-slate-mutedText">{c.label}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-bold text-slate-deep">
        Recent orders
      </h2>
      <div className="card overflow-hidden">
        {orders.length === 0 ? (
          <p className="p-6 text-sm text-slate-mutedText">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-brand-lilac/50 text-left text-xs uppercase text-slate-mutedText">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-mono text-xs">{o.id.slice(0, 10)}</td>
                  <td className="px-4 py-3">{o.customer.name}</td>
                  <td className="px-4 py-3 font-semibold">{inr(o.total)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
