"use client";

// Thin wrapper around Razorpay Checkout. In mock mode (no key configured and
// no backend) we simulate a successful payment so the full flow is testable
// end-to-end without credentials.

const KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const API = process.env.NEXT_PUBLIC_API_URL;

export interface PayArgs {
  amount: number; // in INR (rupees)
  name: string;
  email: string;
  phone: string;
  orderTitle: string;
  receipt?: string; // our reference, echoed into the Razorpay dashboard
}

export interface PayResult {
  paymentId: string;
  orderId: string;
  signature: string;
  mock: boolean;
}

export class PaymentCancelled extends Error {
  constructor() {
    super("Payment cancelled");
    this.name = "PaymentCancelled";
  }
}

function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export async function payWithRazorpay(args: PayArgs): Promise<PayResult> {
  // No backend at all → the pure front-end demo, where a simulated payment is
  // the point. Anything else must go through Razorpay for real.
  if (!API) {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      paymentId: `pay_mock_${Math.random().toString(36).slice(2, 10)}`,
      orderId: `order_mock_${Math.random().toString(36).slice(2, 10)}`,
      signature: "mock_signature",
      mock: true,
    };
  }

  // A configured backend with no key means a MISCONFIGURED deploy, not a demo.
  // Simulating success here would hand out books for free, so fail loudly.
  if (!KEY_ID) {
    throw new Error(
      "Payments are not configured (NEXT_PUBLIC_RAZORPAY_KEY_ID is missing from this build).",
    );
  }

  const ok = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!ok) throw new Error("Failed to load Razorpay. Check your connection.");

  // Ask the backend to create a Razorpay order (amount in paise handled server-side).
  const res = await fetch(`${API}/payments/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: args.amount, receipt: args.receipt }),
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => (typeof j?.detail === "string" ? j.detail : null))
      .catch(() => null);
    throw new Error(detail || "Could not start payment.");
  }
  const rp = await res.json(); // { id, amount, currency }

  return new Promise<PayResult>((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: KEY_ID,
      amount: rp.amount,
      currency: rp.currency || "INR",
      name: "KuttyStory",
      description: args.orderTitle,
      order_id: rp.id,
      prefill: { name: args.name, email: args.email, contact: args.phone },
      theme: { color: "#FF6F61" },
      handler: (r: any) =>
        resolve({
          paymentId: r.razorpay_payment_id,
          orderId: r.razorpay_order_id,
          signature: r.razorpay_signature,
          mock: false,
        }),
      modal: { ondismiss: () => reject(new PaymentCancelled()) },
    });
    // A declined card or failed UPI collect fires this instead of the handler;
    // without it the promise would hang and the button would spin forever.
    rzp.on("payment.failed", (e: any) => {
      const d = e?.error || {};
      reject(
        new Error(
          d.description || d.reason || "Payment failed. Please try another method.",
        ),
      );
    });
    rzp.open();
  });
}
