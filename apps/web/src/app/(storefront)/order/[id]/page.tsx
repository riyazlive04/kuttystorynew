"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileText, Loader2, Package, Truck } from "lucide-react";
import { bookPdfUrl, downloadFile, getOrder, invoiceUrl } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { inr } from "@/lib/format";
import { PRICES, isPrinted } from "@/lib/pricing";
import { CURRENCY, contentsFrom, trackOnce } from "@/lib/pixel";
import type { Order } from "@/lib/types";

export default function OrderPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const addToCart = useCart((s) => s.add);
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getOrder(id).then((o) => setOrder(o ?? null));
  }, [id]);

  // The sale. Keyed on the order id so a refresh, a back-button, or the
  // customer reopening the link months later never counts the revenue twice —
  // Meta bids on this number, and a double count teaches it the wrong price.
  useEffect(() => {
    if (!order) return;
    trackOnce(`purchase:${order.id}`, "Purchase", {
      ...contentsFrom(order.items),
      value: order.total,
      currency: CURRENCY,
      order_id: order.id,
    });
  }, [order]);

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
  const hasPrint = order.items.some((i) => isPrinted(i.format));
  const jobId = order.items.find((i) => i.jobId)?.jobId || "";
  // Any item works as the source for the print upsell (same book/child).
  const src = order.items[0];

  async function downloadBook() {
    if (!jobId) return;
    setDownloading(true);
    const ok = await downloadFile(
      bookPdfUrl(jobId),
      `KuttyStory-${src?.childName || "story"}.pdf`,
    );
    setDownloading(false);
    if (!ok)
      alert(
        "Your book is still being prepared (all 28 pages are rendering). Please try again in a couple of minutes.",
      );
  }

  function orderPrintedBook() {
    if (!src) return;
    addToCart({
      id: `${src.jobId || src.storySlug}-print`,
      jobId: src.jobId,
      storySlug: src.storySlug,
      storyTitle: src.storyTitle,
      childName: src.childName,
      format: "print",
      language: src.language,
      coverImage: src.coverImage,
      unitPrice: PRICES.print,
      quantity: 1,
    });
    router.push("/checkout");
  }

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

      <p className="mt-4 text-center text-sm">
        <a
          href={invoiceUrl(order.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-bold text-brand-primary hover:underline"
        >
          <FileText className="h-4 w-4" /> View invoice
          {order.orderNumber ? ` (${order.orderNumber})` : ""}
        </a>
      </p>

      <p className="mt-6 text-center text-sm text-slate-mutedText">
        We&apos;re now generating all the personalized pages of your book. The
        full PDF becomes downloadable once it&apos;s ready (usually a couple of
        minutes).
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {hasPdf && (
          <div className="card p-6 text-center">
            <Download className="mx-auto h-8 w-8 text-brand-primary" />
            <h3 className="mt-3 font-bold text-slate-deep">Your PDF</h3>
            <p className="mt-1 text-sm text-slate-mutedText">
              High-resolution, all 28 pages.
            </p>
            <button
              onClick={downloadBook}
              disabled={downloading || !jobId}
              className="btn-outline mt-4 inline-flex w-full items-center justify-center gap-2 !py-2.5 text-sm disabled:opacity-60"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Download PDF
                </>
              )}
            </button>
          </div>
        )}

        {hasPrint && order.tracking?.number ? (
          <div className="card p-6 text-center">
            <Truck className="mx-auto h-8 w-8 text-emerald-500" />
            <h3 className="mt-3 font-bold text-slate-deep">On its way</h3>
            <p className="mt-1 text-sm text-slate-mutedText">
              {order.tracking.courier || "Courier"} &middot;{" "}
              <span className="font-mono">{order.tracking.number}</span>
            </p>
            {order.tracking.url && (
              <a
                href={order.tracking.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline mt-4 inline-flex w-full items-center justify-center gap-2 !py-2.5 text-sm"
              >
                <Truck className="h-4 w-4" /> Track your parcel
              </a>
            )}
          </div>
        ) : hasPrint ? (
          <div className="card p-6 text-center">
            <Package className="mx-auto h-8 w-8 text-emerald-500" />
            <h3 className="mt-3 font-bold text-slate-deep">Print in production</h3>
            <p className="mt-1 text-sm text-slate-mutedText">
              Printing takes 4-7 days. We&apos;ll email tracking the moment it
              ships - delivery time depends on your state.
            </p>
            <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
              Status: In production
            </span>
          </div>
        ) : (
          // PDF-only order → upsell a printed hardcover of the same book.
          <div className="card border-2 border-brand-primary p-6 text-center">
            <Package className="mx-auto h-8 w-8 text-brand-primary" />
            <h3 className="mt-3 font-bold text-slate-deep">Want it in print?</h3>
            <p className="mt-1 text-sm text-slate-mutedText">
              Get {src?.childName || "your child"}&apos;s book as a premium
              hardcover, delivered across India.
            </p>
            <button
              onClick={orderPrintedBook}
              className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 !py-2.5 text-sm"
            >
              <Package className="h-4 w-4" /> Order printed book · {inr(PRICES.print)}
            </button>
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
