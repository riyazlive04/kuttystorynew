"""Transactional customer email via Resend (https://resend.com).

Sent when an admin moves an order to a new status. Blank RESEND_API_KEY
disables sending entirely (the status change itself still succeeds), so local
dev and deploys without a key never email real customers.
"""
import html
import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"

# status -> (subject, headline, body paragraph). "pending" is deliberately
# absent: moving an order back to pending is an admin correction, not news.
STATUS_COPY: dict[str, tuple[str, str, str]] = {
    "paid": (
        "We've received your KuttyStory order",
        "Thank you for your order!",
        "Your payment is confirmed and your personalised storybook is in our queue. "
        "We'll email you again as soon as it moves into production.",
    ),
    "in_production": (
        "Your KuttyStory book is being made",
        "Your book is in production",
        "Our team has started preparing your personalised storybook. "
        "We'll let you know the moment it ships.",
    ),
    "shipped": (
        "Your KuttyStory book has shipped",
        "Your book is on its way!",
        "Your personalised storybook has been handed to our delivery partner "
        "and is on its way to you.",
    ),
    "delivered": (
        "Your KuttyStory book has been delivered",
        "Your book has arrived",
        "Your personalised storybook has been delivered. We hope your little one "
        "loves being the hero of their own story!",
    ),
    "cancelled": (
        "Your KuttyStory order has been cancelled",
        "Your order has been cancelled",
        "Your order has been cancelled. If you didn't expect this, or if a refund "
        "is due, just reply to this email and we'll sort it out.",
    ),
}


def _rupees(amount: int) -> str:
    return f"₹{amount:,}"


def _render(order, headline: str, body: str, extra: str = "") -> str:
    esc = html.escape
    rows = "".join(
        f"<tr><td style='padding:6px 0;color:#334155'>{esc(i.storyTitle)} &middot; "
        f"{esc(i.childName)} &middot; {esc(i.format)} &times;{i.quantity}</td></tr>"
        for i in (order.items or [])
    )
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;background:#f8f5ff;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <h1 style="margin:0 0 4px;color:#9333ea;font-size:22px">Kutty Story</h1>
    <h2 style="margin:16px 0 8px;color:#1e1b4b;font-size:20px">{esc(headline)}</h2>
    <p style="margin:0 0 16px;color:#334155;line-height:1.5">Hi {esc(order.customerName)},</p>
    <p style="margin:0 0 20px;color:#334155;line-height:1.5">{esc(body)}</p>
    {extra}
    <table style="width:100%;border-top:1px solid #e2e8f0;padding-top:8px">{rows}</table>
    <p style="margin:16px 0 0;color:#1e1b4b;font-weight:bold">Total: {_rupees(order.total)}</p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Order reference: {esc(order.id)}</p>
  </div>
</div>"""


async def _send(order, subject: str, body_html: str, what: str) -> bool:
    """Post one email to Resend. Never raises; returns whether it was sent."""
    if not settings.resend_api_key:
        log.info("RESEND_API_KEY not set; skipping %s email for order %s", what, order.id)
        return False
    if not order.customerEmail:
        return False
    payload = {
        "from": settings.email_from,
        "to": [order.customerEmail],
        "subject": subject,
        "html": body_html,
    }
    if settings.email_reply_to:
        payload["reply_to"] = settings.email_reply_to
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                RESEND_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
        if r.status_code >= 400:
            log.error("Resend rejected %s email for order %s: %s %s",
                      what, order.id, r.status_code, r.text)
            return False
        log.info("Sent %s email for order %s", what, order.id)
        return True
    except httpx.HTTPError as e:
        log.error("Resend request failed for order %s: %s", order.id, e)
        return False


async def send_invoice_email(order, invoice_no: str | None = None) -> bool:
    """Send the invoice itself as the email body, plus a link to the same page.

    The invoice IS the email -- no attachment, so nothing to download before it
    can be read, and the link is there for a customer who wants a PDF (their
    browser's Print to PDF) or who reads mail in a client that strips images.
    """
    from .invoice import next_invoice_number, render_invoice

    inv_no = invoice_no or next_invoice_number(order, getattr(order, "invoicedAt", None))
    link = f"{settings.public_site_url}/api/orders/{order.id}/invoice"
    body = render_invoice(order, invoice_no=inv_no) + (
        f'<div style="font-family:Arial,Helvetica,sans-serif;text-align:center;'
        f'padding:14px 20px 28px;color:#6b5b73;font-size:13px">'
        f'<a href="{html.escape(link)}" style="color:#8b3fa8">View or download this invoice</a>'
        f"</div>"
    )
    return await _send(
        order, f"Your Kutty Story invoice {inv_no}", body, "invoice"
    )


async def send_tracking_email(order) -> bool:
    """Tell the customer where their parcel is, as soon as tracking is saved."""
    esc = html.escape
    courier = esc(order.courier or "our delivery partner")
    number = esc(order.trackingNumber or "")
    url = (order.trackingUrl or "").strip()
    track_line = (
        f"<p style='margin:0 0 8px;color:#334155'>Courier: <b>{courier}</b></p>"
        f"<p style='margin:0 0 8px;color:#334155'>Tracking number: <b>{number}</b></p>"
    )
    if url:
        track_line += (
            f"<p style='margin:16px 0 0'><a href='{esc(url)}' "
            f"style='background:#8b3fa8;color:#fff;text-decoration:none;"
            f"border-radius:10px;padding:10px 18px;display:inline-block'>"
            f"Track your parcel</a></p>"
        )
    return await _send(
        order,
        "Your KuttyStory book is on its way",
        _render(
            order,
            "Your book has shipped",
            "Your personalised storybook is on its way. Here are the tracking "
            "details so you can follow it.",
            extra=track_line,
        ),
        "tracking",
    )


async def send_order_status_email(order) -> None:
    """Email the customer about `order`'s current status. Never raises: a
    failed email must not undo or block the admin's status change."""
    copy = STATUS_COPY.get(order.status)
    if not copy:
        return
    subject, headline, body = copy
    extra = ""
    # A "shipped" mail with tracking already saved should carry it.
    if order.status == "shipped" and getattr(order, "trackingNumber", None):
        courier = html.escape(order.courier or "our delivery partner")
        number = html.escape(order.trackingNumber)
        extra = (
            f"<p style='margin:0 0 16px;color:#334155'>{courier} &middot; "
            f"tracking number <b>{number}</b></p>"
        )
        if (order.trackingUrl or "").strip():
            extra += (
                f"<p style='margin:0 0 16px'><a href='{html.escape(order.trackingUrl)}' "
                f"style='color:#8b3fa8'>Track your parcel</a></p>"
            )
    await _send(order, subject, _render(order, headline, body, extra=extra), order.status)
