"""The customer's invoice, as HTML.

One template, used three ways: the admin previews it, the customer opens it from
a link (and prints or saves it as a PDF from the browser), and it is the body of
the invoice email. That rules out a stylesheet and anything clever -- email
clients strip <style> and never load a CSS file -- so every rule here is inline
and the layout is tables where it has to survive Gmail and Outlook.

The artwork (logo, brush badge, handwritten thank-you, book stack, footer wave)
is served from the website as ordinary images, cut from the design in
invoice.png. Keeping them as images is what makes the emailed invoice look like
the design instead of an approximation of it in web fonts.
"""
from __future__ import annotations

import html
from datetime import datetime, timezone

from .config import settings

# Brand palette, read off the design.
PLUM = "#6b2d7a"
PURPLE = "#8b3fa8"
INK = "#3f3247"
PINK_CARD = "#fdf1f8"
LILAC_CARD = "#f4f0fc"
LINE = "#e8d9ef"

FONT = "'Trebuchet MS','Segoe UI',Arial,Helvetica,sans-serif"


def order_number(order) -> str:
    """KS-0096. Falls back to the cuid's tail on a row written before orderNo."""
    n = getattr(order, "orderNo", None)
    return f"KS-{int(n):04d}" if n else f"KS-{str(order.id)[-6:].upper()}"


def invoice_prefix(when: datetime | None = None) -> str:
    return f"KS{(when or datetime.now(timezone.utc)):%Y%m%d}-"


def next_invoice_number(
    order, when: datetime | None = None, issued_today: int = 0
) -> str:
    """KS20260917-01: the issue date plus that day's sequence.

    An order already carrying an invoiceNo keeps it — re-sending an invoice must
    never renumber the one the customer has. `issued_today` is how many invoices
    the day already has (the caller counts them); without it the sequence falls
    back to 01, which is right for the first of the day and harmless in a
    preview.
    """
    existing = (getattr(order, "invoiceNo", "") or "").strip()
    if existing:
        return existing
    return f"{invoice_prefix(when)}{min(int(issued_today) + 1, 99):02d}"


def _rs(n: int) -> str:
    return f"{n:,}"


def _addr_lines(order) -> list[str]:
    parts = [order.address1, order.address2]
    city = ", ".join(p for p in [order.city, order.state] if p)
    if order.pincode:
        city = f"{city} - {order.pincode}" if city else str(order.pincode)
    parts.append(city)
    return [p.strip() for p in parts if p and str(p).strip()]


FORMAT_LABELS = {
    "pdf": "PDF Version",
    "staple": "Staple Bound",
    "print": "Hard Cover",
}


def format_label(fmt: str) -> str:
    return FORMAT_LABELS.get((fmt or "").strip().lower(), (fmt or "").title())


def render_invoice(order, *, invoice_no: str | None = None, issued=None) -> str:
    """The invoice for `order` as a complete HTML document."""
    esc = html.escape
    site = settings.public_site_url
    art = f"{site}/invoice"
    issued = issued or getattr(order, "invoicedAt", None) or datetime.now(timezone.utc)
    inv_no = invoice_no or next_invoice_number(order, issued)

    rows = []
    for i, it in enumerate(order.items or [], start=1):
        amount = int(it.unitPrice) * int(it.quantity)
        cells = [
            (str(i), "center"),
            (f"{esc(it.storyTitle)}<div style=\"font-size:12px;color:#8b7f92\">"
             f"{esc(format_label(it.format))}</div>", "left"),
            (esc(it.childName), "center"),
            (str(it.quantity), "center"),
            (_rs(int(it.unitPrice)), "center"),
            (_rs(amount), "center"),
        ]
        rows.append(
            "<tr>"
            + "".join(
                f'<td style="padding:14px 10px;border-top:1px solid {LINE};'
                f'text-align:{align};color:{INK};font-size:15px">{value}</td>'
                for value, align in cells
            )
            + "</tr>"
        )

    head_cells = "".join(
        f'<th style="padding:12px 10px;background:{PINK_CARD};color:{PLUM};'
        f'font-size:14px;text-align:{align};font-weight:bold">{label}</th>'
        for label, align in [
            ("S.No", "center"), ("Product Details", "left"),
            ("Personalised Name", "center"), ("Qty", "center"),
            ("Price (₹)", "center"), ("Amount (₹)", "center"),
        ]
    )

    meta = "".join(
        f'<tr><td style="padding:3px 0;color:{INK};font-size:14px;'
        f'white-space:nowrap">{label}</td>'
        f'<td style="padding:3px 0 3px 10px;color:{PLUM};font-size:14px;'
        f'font-weight:bold">: {value}</td></tr>'
        for label, value in [
            ("Invoice No", esc(inv_no)),
            ("Date", f"{issued:%d %b %Y}"),
            ("Order No", esc(order_number(order))),
        ]
    )

    seller = "<br>".join(esc(line) for line in settings.invoice_address.split("\n"))
    buyer = "<br>".join(esc(line) for line in _addr_lines(order)) or (
        '<span style="color:#8b7f92">Digital delivery</span>'
    )

    def party(icon: str, tag: str, name: str, lines: str, phone: str, bg: str) -> str:
        return f"""\
<td width="50%" valign="top" style="padding:6px">
  <div style="background:{bg};border-radius:14px;padding:18px 20px">
    <div style="margin-bottom:10px">
      <span style="display:inline-block;background:{PURPLE};color:#fff;border-radius:50%;
        width:26px;height:26px;text-align:center;line-height:26px;font-size:14px">{icon}</span>
      <span style="display:inline-block;background:#fff;color:{PLUM};border-radius:12px;
        padding:3px 14px;margin-left:8px;font-size:14px;font-weight:bold">{tag}</span>
    </div>
    <div style="color:{PLUM};font-size:17px;font-weight:bold;margin-bottom:4px">{name}</div>
    <div style="color:{INK};font-size:14px;line-height:1.55">{lines}</div>
    <div style="color:{INK};font-size:14px;margin-top:4px">Phone: {phone}</div>
  </div>
</td>"""

    discount_row = ""
    if int(getattr(order, "discount", 0) or 0) > 0:
        discount_row = (
            f'<tr><td style="padding:4px 18px;color:{INK};font-size:14px">Discount'
            f'{" (" + esc(order.promoCode) + ")" if order.promoCode else ""}</td>'
            f'<td style="padding:4px 18px;text-align:right;color:{INK};font-size:14px">'
            f'-₹{_rs(int(order.discount))}</td></tr>'
        )
    shipping_row = ""
    if int(getattr(order, "shipping", 0) or 0) > 0:
        shipping_row = (
            f'<tr><td style="padding:4px 18px;color:{INK};font-size:14px">Shipping</td>'
            f'<td style="padding:4px 18px;text-align:right;color:{INK};font-size:14px">'
            f'₹{_rs(int(order.shipping))}</td></tr>'
        )

    return f"""\
<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice {esc(inv_no)} · {settings.invoice_business_name}</title>
</head>
<body style="margin:0;padding:0;background:#f6f1fa">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1fa;padding:20px 0">
<tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:100%;
  background:#ffffff;border-radius:18px;overflow:hidden;font-family:{FONT}">

  <tr><td style="padding:26px 30px 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="120" valign="top"><img src="{art}/logo.png" width="110" alt="Kutty Story"
        style="display:block;border:0"></td>
      <td valign="top" align="center"><img src="{art}/wordmark.png" width="300"
        alt="Kutty Story — personalised story books for little dreamers"
        style="display:block;border:0;margin:0 auto"></td>
      <td width="110" valign="top" align="right"><img src="{art}/badge.png" width="92"
        alt="Little stories, big smiles" style="display:block;border:0"></td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:14px 30px 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle"><div style="font-size:40px;font-weight:bold;color:{PLUM};
        letter-spacing:1px">INVOICE</div></td>
      <td valign="middle" align="right">
        <div style="background:{LILAC_CARD};border-radius:12px;padding:14px 18px;display:inline-block">
          <table cellpadding="0" cellspacing="0">{meta}</table>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:16px 24px 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      {party("&#9750;", "From", esc(settings.invoice_business_name), seller,
             esc(settings.invoice_phone), PINK_CARD)}
      {party("&#9679;", "To", esc(order.customerName), buyer,
             esc(order.customerPhone or "-"), LILAC_CARD)}
    </tr></table>
  </td></tr>

  <tr><td style="padding:18px 30px 0">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid {LINE};border-radius:10px;border-collapse:separate">
      <tr>{head_cells}</tr>
      {"".join(rows)}
    </table>
  </td></tr>

  <tr><td style="padding:14px 30px 0" align="right">
    <table width="320" cellpadding="0" cellspacing="0"
      style="background:{PINK_CARD};border-radius:12px">
      {discount_row}{shipping_row}
      <tr>
        <td style="padding:14px 18px;color:{PLUM};font-size:17px;font-weight:bold">Total Amount</td>
        <td style="padding:14px 18px;text-align:right;color:{PLUM};font-size:20px;
          font-weight:bold">₹ {_rs(int(order.total))}/-</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 30px 26px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="45%" valign="middle"><img src="{art}/thanks.png" width="250"
        alt="Thank you for supporting Kutty Story!" style="display:block;border:0"></td>
      <td valign="middle" align="center" style="border-left:1px solid {LINE};padding-left:18px">
        <div style="color:{PURPLE};font-size:16px;font-style:italic;line-height:1.5">
          &ldquo;Every child has a story<br>worth telling.&rdquo;</div>
      </td>
      <td width="150" valign="middle" align="right"><img src="{art}/books.png" width="130"
        alt="Read, dream, grow, belong" style="display:block;border:0"></td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0"><img src="{art}/footer.png" width="720"
    alt="www.kuttystory.co.in · 9003169615 · @kuttystory"
    style="display:block;border:0;width:100%"></td></tr>

</table>
</td></tr></table>
</body></html>"""
