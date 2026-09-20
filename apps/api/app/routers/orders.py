from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from ..db import prisma
from ..promo import compute_discount
from ..schemas import OrderIn
from ..serializers import order_dict

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("")
async def create_order(payload: OrderIn):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Recompute all money server-side — never trust client-sent amounts. The
    # line price comes from OUR list for the chosen edition: a cart posting
    # {"format": "print", "unitPrice": 1} used to be billed as sent.
    from ..pricing import price_for

    try:
        unit = {id(i): price_for(i.format) for i in payload.items}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    subtotal = sum(unit[id(i)] * i.quantity for i in payload.items)
    qty = sum(i.quantity for i in payload.items)
    discount, applied_code = compute_discount(payload.promoCode, subtotal, qty)
    shipping = 0
    total = subtotal - discount + shipping

    # Link the primary preview session + format for fulfillment.
    primary = next((i for i in payload.items if i.jobId), None)
    preview_session_id = primary.jobId if primary else None
    order_format = payload.items[0].format if payload.items else None

    order = await prisma.order.create(
        data={
            "status": "pending",
            "previewSessionId": preview_session_id,
            "format": order_format,
            "customerName": payload.customer.name,
            "customerEmail": payload.customer.email,
            "customerPhone": payload.customer.phone,
            "address1": payload.customer.address1,
            "address2": payload.customer.address2,
            "city": payload.customer.city,
            "state": payload.customer.state,
            "pincode": payload.customer.pincode,
            "subtotal": subtotal,
            "discount": discount,
            "promoCode": applied_code,
            "shipping": shipping,
            "total": total,
            "items": {
                "create": [
                    {
                        "jobId": i.jobId or None,
                        "storySlug": i.storySlug,
                        "storyTitle": i.storyTitle,
                        "childName": i.childName,
                        "format": i.format,
                        "language": i.language,
                        "coverImage": i.coverImage,
                        "unitPrice": unit[id(i)],
                        "quantity": i.quantity,
                    }
                    for i in payload.items
                ]
            },
        },
        include={"items": True},
    )

    # Fulfillment: render the FULL 28-page story for every purchased preview
    # session (both PDF and print orders), then the book PDF is built. Idempotent
    # enough for our flow — one order → one render kickoff per unique job.
    job_ids = {i.jobId for i in payload.items if i.jobId}
    for jid in job_ids:
        try:
            from ..tasks import render_remaining

            render_remaining.delay(jid)
        except Exception:
            # No broker (pure API demo) — the book can still be built on download.
            pass

    return order_dict(order)


@router.get("/{order_id}")
async def get_order(order_id: str):
    order = await prisma.order.find_unique(
        where={"id": order_id}, include={"items": True}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_dict(order)


@router.get("/{order_id}/invoice", response_class=HTMLResponse)
async def order_invoice(order_id: str):
    """The order's invoice as a web page — the link in the invoice email, and
    what the customer prints or saves as a PDF from their browser.

    Public like GET /orders/{id}: the id is an unguessable cuid, and the page
    carries nothing the customer doesn't already see on their order.
    """
    order = await prisma.order.find_unique(
        where={"id": order_id}, include={"items": True}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    from ..invoice import render_invoice

    return HTMLResponse(render_invoice(order))
