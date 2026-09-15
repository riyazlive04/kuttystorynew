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


def _render(order, headline: str, body: str) -> str:
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
    <table style="width:100%;border-top:1px solid #e2e8f0;padding-top:8px">{rows}</table>
    <p style="margin:16px 0 0;color:#1e1b4b;font-weight:bold">Total: {_rupees(order.total)}</p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Order reference: {esc(order.id)}</p>
  </div>
</div>"""


async def send_order_status_email(order) -> None:
    """Email the customer about `order`'s current status. Never raises: a
    failed email must not undo or block the admin's status change."""
    copy = STATUS_COPY.get(order.status)
    if not copy:
        return
    if not settings.resend_api_key:
        log.info("RESEND_API_KEY not set; skipping %s email for order %s", order.status, order.id)
        return
    if not order.customerEmail:
        return

    subject, headline, body = copy
    payload = {
        "from": settings.email_from,
        "to": [order.customerEmail],
        "subject": subject,
        "html": _render(order, headline, body),
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
                      order.status, order.id, r.status_code, r.text)
        else:
            log.info("Sent %s email for order %s", order.status, order.id)
    except httpx.HTTPError as e:
        log.error("Resend request failed for order %s: %s", order.id, e)
