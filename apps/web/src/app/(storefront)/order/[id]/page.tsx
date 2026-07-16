"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Loader2, Package } from "lucide-react";
import { getOrder } from "@/lib/api";
import { inr } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function OrderPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    getOrder(id).then((o) => setOrder(o ?? null));
  }, [id]);

  if (order === undefined) {
    return (
      <div className="container-x grid place-items-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-deep">Order not found</h1>
        <Link href="/stories" className="btn-primary mt-6 inline-flex">
          Browse stories
        </Link>
      </div>
    );
  }

  const hasPdf = order.items.some((i) => i.format === "pdf");
  const hasPrint = order.items.some((i) => i.format === "print");

  return (
    <div className="container-x max-w-2xl py-16">
      <div className="text-center">
        <span className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-10 w-10" />
        </span>
        <h1 className="text-3xl font-bold text-slate-deep">
          Thank you, {order.customer.name.split(" ")[0]}! 🎉
        </h1>
        <p className="mt-2 text-slate-mutedText">
          Your order <span className="font-bold text-slate-deep">{order.id}</span>{" "}
          is confirmed. A receipt is on its way to {order.customer.email}.
        </p>
      </div>

      <div className="card mt-10 divide-y divide-slate-100">
        {order.items.map((i) => (
          <div key={i.id} className="flex items-center justify-between p-5">
            <div>
              <p className="font-bold text-slate-deep">{i.storyTitle}</p>
              <p className="text-sm text-slate-mutedText">
                For {i.childName} · {i.format === "pdf" ? "Instant PDF" : "Hardcover"} ×{i.quantity}
              </p>
            </div>
            <span className="font-bold text-slate-deep">
              {inr(i.unitPrice * i.quantity)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between p-5">
          <span className="font-bold text-slate-deep">Total paid</span>
          <span className="text-lg font-extrabold text-slate-deep">
            {inr(order.total)}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {hasPdf && (
          <div className="card p-6 text-center">
            <Download className="mx-auto h-8 w-8 text-brand-primary" />
            <h3 className="mt-3 font-bold text-slate-deep">Your PDF is ready</h3>
            <p className="mt-1 text-sm text-slate-mutedText">
              High-resolution, print-ready download.
            </p>
            <button className="btn-outline mt-4 w-full !py-2.5 text-sm">
              Download PDF
            </button>
          </div>
        )}
        {hasPrint && (
          <div className="card p-6 text-center">
            <Package className="mx-auto h-8 w-8 text-emerald-500" />
            <h3 className="mt-3 font-bold text-slate-deep">Print in production</h3>
            <p className="mt-1 text-sm text-slate-mutedText">
              We&apos;ll email tracking once it ships (2-3 days).
            </p>
            <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
              Status: In production
            </span>
          </div>
        )}
      </div>

      <div className="mt-10 text-center">
        <Link href="/stories" className="btn-primary inline-flex">
          Create another book
        </Link>
      </div>
    </div>
  );
}
