# "Under construction" gate

Puts a password popup in front of every page of kuttystory.co.in. The client
enters the password once and browses normally; everyone else sees only the
holding popup. The site stays **fully running** — nothing is stopped, no data
is touched.

For the alternative (site actually stopped, 503 holding page) see
[MAINTENANCE.md](./MAINTENANCE.md). The two are independent; use one or the other.

---

## How it works

| Piece | File |
| --- | --- |
| Gate check on every request | [`apps/web/src/middleware.ts`](../apps/web/src/middleware.ts) |
| Password check + cookie | [`apps/web/src/app/site-access/unlock/route.ts`](../apps/web/src/app/site-access/unlock/route.ts) |
| The popup | [`apps/web/src/components/SiteGate.tsx`](../apps/web/src/components/SiteGate.tsx) |
| Shared token helper | [`apps/web/src/lib/site-gate.ts`](../apps/web/src/lib/site-gate.ts) |

Middleware runs before every page. No valid cookie means the request is
**rewritten** to the gate page — rewritten, not redirected, so the URL stays put
and unlocking drops the visitor on the page they originally asked for.

The popup is a real gate, not a CSS trick. Real page content is never sent to
an unauthenticated browser, so there is nothing to recover by deleting the
overlay in devtools. What sits blurred behind the popup is a decorative
stand-in built from empty coloured boxes.

The cookie holds SHA-256 of the password, never the password, and is
`HttpOnly` + `Secure` + `SameSite=Lax`, good for 30 days.

**The gate is off when `SITE_GATE_PASSWORD` is unset.** Local dev and anything
that hasn't opted in behaves exactly as before.

---

## Turn it on

```bash
ssh root@93.127.199.127
cd /opt/kuttystory

# 1. Set the password.
echo 'SITE_GATE_PASSWORD=KuttyStory@123' >> .env
chmod 600 .env

# 2. Pull the new code and rebuild the web image. The rebuild is needed because
#    the middleware is new code; later password *changes* need only step 3.
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build web
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d web
```

Verify — the first must show the popup, the second must let you in:

```bash
curl -s https://kuttystory.co.in/ | grep -q "Site under construction" && echo "GATED"

curl -s -X POST https://kuttystory.co.in/site-access/unlock \
  -H 'Content-Type: application/json' \
  -d '{"password":"KuttyStory@123"}' -i | grep -i set-cookie
```

## Change the password

Edit `SITE_GATE_PASSWORD` in `/opt/kuttystory/.env`, then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d web
```

No rebuild — it's read at runtime. Existing cookies stop working immediately,
because the cookie is a hash of the old password.

## Turn it off (site public again)

Remove the `SITE_GATE_PASSWORD` line from `/opt/kuttystory/.env` and recreate
the container. Note `docker-compose.prod.yml` declares the variable as
**required**, so with the line gone compose will refuse to start rather than
quietly serving the site to the world — change it to `${SITE_GATE_PASSWORD:-}`
at the same time if you want it genuinely optional.

---

## What the gate does NOT cover

Nginx proxies `/api/` and `/uploads/` **straight to FastAPI**, never touching
the Next.js app — so the middleware never sees those requests. While the gate
is up:

- `https://kuttystory.co.in/api/...` is still publicly reachable.
- `https://kuttystory.co.in/uploads/...` — generated page images and print
  PDFs — is still publicly reachable.

That's pre-existing behaviour, not something the gate changed, and it doesn't
affect the "end users can't browse the site" goal. But if you want those closed
too, add this to the `/api/` and `/uploads/` blocks in the host vhost:

```nginx
# Same cookie the Next gate sets: sha256("kuttystory-site-gate:" + password).
# Recompute if you change the password.
if ($cookie_ks_site_access != "9828e376883989491bcefa3b359258edd16b86fa60d073a6127e64a62b39e911") {
    return 403;
}
```

⚠️ **This will also block Razorpay's webhook**, which arrives with no cookie —
payments would stop being recorded. Only do it if the site is genuinely closed
for business, and disable the webhook in the Razorpay dashboard at the same time.

---

## SEO

The gate page is `noindex, nofollow` and its og:/twitter: tags are blanked, so
Google won't index the holding page or scrape the product pitch off it. But
every real page now returns the gate, so **the site will progressively drop out
of the index** the longer this stays up — a few weeks is fine, months is not.

If this becomes a long hold, the 503-based approach in
[MAINTENANCE.md](./MAINTENANCE.md) preserves rankings better, because 503 tells
crawlers "temporarily unavailable" rather than showing them a real page with
nothing on it. Worth revisiting rather than leaving the gate up indefinitely.
