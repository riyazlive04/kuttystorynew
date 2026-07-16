import hashlib
import hmac

from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..db import prisma
from ..schemas import CreatePaymentIn, CreatePaymentOut, VerifyPaymentIn

router = APIRouter(prefix="/payments", tags=["payments"])


def _razorpay_client():
    import razorpay

    return razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )


@router.post("/create-order", response_model=CreatePaymentOut)
async def create_payment_order(payload: CreatePaymentIn):
    """Create a Razorpay order. Amount arrives in rupees, Razorpay wants paise."""
    amount_paise = payload.amount * 100

    if not settings.payments_live:
        # Mock mode — no credentials configured.
        return CreatePaymentOut(
            id=f"order_mock_{payload.amount}", amount=amount_paise, live=False
        )

    client = _razorpay_client()
    rp_order = client.order.create(
        {"amount": amount_paise, "currency": "INR", "payment_capture": 1}
    )
    return CreatePaymentOut(
        id=rp_order["id"], amount=amount_paise, currency="INR", live=True
    )


@router.post("/verify")
async def verify_payment(payload: VerifyPaymentIn):
    """Verify the Razorpay signature and mark our order paid."""
    order = await prisma.order.find_unique(where={"id": payload.orderId})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if settings.payments_live:
        expected = hmac.new(
            settings.razorpay_key_secret.encode(),
            f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, payload.razorpay_signature):
            raise HTTPException(status_code=400, detail="Invalid payment signature")

    updated = await prisma.order.update(
        where={"id": payload.orderId},
        data={
            "status": "paid",
            "razorpayOrderId": payload.razorpay_order_id,
            "razorpayPaymentId": payload.razorpay_payment_id,
        },
    )
    _fire_fulfillment(updated)
    return {"ok": True, "orderId": updated.id, "status": updated.status}


def _fire_fulfillment(order) -> None:
    """Queue rendering of the locked pages (14..28) for the paid preview session."""
    if not getattr(order, "previewSessionId", None):
        return
    try:
        from ..tasks import render_remaining

        render_remaining.delay(order.previewSessionId)
    except Exception:
        pass  # broker unavailable in pure-API demo; safe to ignore


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Razorpay server-to-server webhook.

    Validates the X-Razorpay-Signature (HMAC-SHA256 of the raw body with the
    webhook secret) per Razorpay's contract, then on `payment.captured` marks
    the matching order paid and fires rendering of the locked pages (14..28).
    """
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if settings.razorpay_webhook_secret:
        expected = hmac.new(
            settings.razorpay_webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json

    try:
        event = json.loads(body.decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if event.get("event") == "payment.captured":
        entity = (
            event.get("payload", {})
            .get("payment", {})
            .get("entity", {})
        )
        rp_order_id = entity.get("order_id")
        payment_id = entity.get("id")
        if rp_order_id:
            order = await prisma.order.find_first(
                where={"razorpayOrderId": rp_order_id}
            )
            if order and order.status == "pending":
                updated = await prisma.order.update(
                    where={"id": order.id},
                    data={"status": "paid", "razorpayPaymentId": payment_id},
                )
                _fire_fulfillment(updated)

    return {"ok": True}
