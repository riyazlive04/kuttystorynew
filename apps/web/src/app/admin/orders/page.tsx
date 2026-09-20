"use client";

import { useEffect, useState } from "react";
import { BookDown, FileText, Loader2, Send, Trash2, Truck } from "lucide-react";
import { adminApi, ApiError, ORDER_STATUSES } from "@/lib/admin";
import { bookPdfUrl, downloadFile, invoiceUrl } from "@/lib/api";
import { inr } from "@/lib/format";
import type { Order } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

// The couriers we actually ship with. "Other" opens a text box rather than
// forcing an admin to pick a wrong one — and a new courier then needs no code
// change to be recorded correctly.
const COURIERS = ["TRACKON", "Delhivery", "Professional", "ST Courier"];
const OTHER = "Other";

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  // Tracking is edited inline, one order at a time.
  const [trackingFor, setTrackingFor] = useState<string | null>(null);
  const [track, setTrack] = useState({ courier: "", trackingNumber: "", trackingUrl: "" });
  const [trackBusy, setTrackBusy] = useState(false);
  // "" (not chosen yet), one of COURIERS, or OTHER.
  const [courierChoice, setCourierChoice] = useState("");

  function openTracking(o: Order) {
    const saved = o.tracking?.courier || "";
    setTrackingFor(o.id);
    // A courier that isn't in the list was typed in as "Other" — reopen it that
    // way instead of silently dropping it back to the first option.
    setCourierChoice(!saved || COURIERS.includes(saved) ? saved : OTHER);
    setTrack({
      courier: saved,
      trackingNumber: o.tracking?.number || "",
      trackingUrl: o.tracking?.url || "",
    });
  }

  async function saveTracking(id: string) {
    if (!track.courier.trim()) {
      alert(
        courierChoice === OTHER
          ? "Type the courier's name."
          : "Choose a courier first.",
      );
      return;
    }
    if (!track.trackingNumber.trim()) {
      alert("Enter the tracking number first.");
      return;
    }
    setTrackBusy(true);
    try {
      const updated = await adminApi.setTracking(id, { ...track, notify: true });
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
      setTrackingFor(null);
      alert(
        updated.notified
          ? "Tracking saved and emailed to the customer."
          : "Tracking saved, but the email was not sent (check RESEND_API_KEY).",
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save tracking");
    } finally {
      setTrackBusy(false);
    }
  }

  async function sendInvoice(o: Order) {
    if (!confirm(`Email the invoice for this order to ${o.customer.email}?`)) return;
    setInvoicingId(o.id);
    try {
      const updated = await adminApi.sendInvoice(o.id);
      setOrders((prev) => prev.map((x) => (x.id === o.id ? updated : x)));
      alert(`Invoice ${updated.invoiceNo || ""} sent to ${o.customer.email}.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not send the invoice");
    } finally {
      setInvoicingId(null);
    }
  }

  async function downloadBook(o: Order) {
    const jobId = o.items.find((i) => i.jobId)?.jobId;
    if (!jobId) {
      alert("No preview session linked to this order.");
      return;
    }
    setDownloadingId(o.id);
    const child = o.items[0]?.childName || "story";
    const ok = await downloadFile(bookPdfUrl(jobId), `KuttyStory-${child}.pdf`);
    setDownloadingId(null);
    if (!ok)
      alert(
        "The full book isn't ready yet (all 28 pages may still be rendering). Try again shortly.",
      );
  }

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
      let updated: Order;
      try {
        updated = await adminApi.setOrderStatus(id, status);
      } catch (e) {
        // 409 = the customer hasn't approved the book for print. Let the admin
        // override deliberately rather than leaving the order stuck.
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        if (!confirm(`${e.message}\n\nMove this order to "${status.replace("_", " ")}" anyway?`)) return;
        updated = await adminApi.setOrderStatus(id, status, true);
      }
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status");
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
                  <p className="font-mono text-xs text-slate-400">
                    {o.orderNumber || o.id}
                  </p>
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
                  onClick={() => downloadBook(o)}
                  disabled={downloadingId === o.id || !o.items.some((i) => i.jobId)}
                  title="Download the full personalized book PDF (all pages)"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border-2 border-brand-primary px-2.5 py-1 text-xs font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white disabled:opacity-50"
                >
                  {downloadingId === o.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BookDown className="h-3.5 w-3.5" />
                  )}
                  Book PDF
                </button>
                <a
                  href={invoiceUrl(o.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the invoice (print or save as PDF from your browser)"
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-brand-borderAccent px-2.5 py-1 text-xs font-bold text-slate-mutedText transition hover:border-brand-primary hover:text-brand-primary"
                >
                  <FileText className="h-3.5 w-3.5" /> Invoice
                </a>
                <button
                  onClick={() => sendInvoice(o)}
                  disabled={invoicingId === o.id}
                  title="Email this invoice to the customer"
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-brand-primary px-2.5 py-1 text-xs font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white disabled:opacity-50"
                >
                  {invoicingId === o.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {o.invoiceNo ? "Resend invoice" : "Send invoice"}
                </button>
                <button
                  onClick={() => (trackingFor === o.id ? setTrackingFor(null) : openTracking(o))}
                  title="Add or update courier tracking"
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-brand-borderAccent px-2.5 py-1 text-xs font-bold text-slate-mutedText transition hover:border-brand-primary hover:text-brand-primary"
                >
                  <Truck className="h-3.5 w-3.5" />
                  {o.tracking?.number ? "Edit tracking" : "Add tracking"}
                </button>
                <button
                  onClick={() => removeOrder(o.id)}
                  disabled={savingId === o.id}
                  title="Delete order permanently"
                  aria-label={`Delete order ${o.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-500 transition hover:border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>

              {o.tracking?.number && trackingFor !== o.id && (
                <p className="mt-3 text-xs text-slate-mutedText">
                  <b className="text-slate-deep">{o.tracking.courier || "Courier"}</b>{" "}
                  &middot; {o.tracking.number}
                  {o.tracking.sentAt
                    ? " \u00b7 emailed to the customer"
                    : " \u00b7 not emailed yet"}
                </p>
              )}

              {trackingFor === o.id && (
                <div className="mt-3 rounded-xl border-2 border-dashed border-brand-borderAccent p-3">
                  <p className="mb-2 text-xs text-slate-mutedText">
                    Saving sends the customer an email with these details, and
                    moves the order to <b>shipped</b>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={courierChoice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCourierChoice(v);
                        // Picking a named courier IS the value; picking Other
                        // clears it so the text box starts empty.
                        setTrack((t) => ({ ...t, courier: v === OTHER ? "" : v }));
                      }}
                      className="w-40 rounded-lg border-2 border-brand-borderAccent bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-primary"
                    >
                      <option value="">Select courier</option>
                      {COURIERS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value={OTHER}>{OTHER}</option>
                    </select>
                    {courierChoice === OTHER && (
                      <input
                        value={track.courier}
                        onChange={(e) =>
                          setTrack((t) => ({ ...t, courier: e.target.value }))
                        }
                        placeholder="Courier name"
                        autoFocus
                        className="w-40 rounded-lg border-2 border-brand-borderAccent px-2.5 py-1.5 text-xs outline-none focus:border-brand-primary"
                      />
                    )}
                    <input
                      value={track.trackingNumber}
                      onChange={(e) =>
                        setTrack((t) => ({ ...t, trackingNumber: e.target.value }))
                      }
                      placeholder="Tracking number"
                      className="w-48 rounded-lg border-2 border-brand-borderAccent px-2.5 py-1.5 text-xs outline-none focus:border-brand-primary"
                    />
                    <input
                      value={track.trackingUrl}
                      onChange={(e) => setTrack((t) => ({ ...t, trackingUrl: e.target.value }))}
                      placeholder="Tracking link (optional)"
                      className="w-64 rounded-lg border-2 border-brand-borderAccent px-2.5 py-1.5 text-xs outline-none focus:border-brand-primary"
                    />
                    <button
                      onClick={() => saveTracking(o.id)}
                      disabled={trackBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {trackBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Save &amp; notify
                    </button>
                    <button
                      onClick={() => setTrackingFor(null)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-mutedText hover:text-slate-deep"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
