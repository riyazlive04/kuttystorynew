# Taking KuttyStory offline (and bringing it back)

> **Not the current approach.** The site is instead being put behind a password
> popup — see [SITE-GATE.md](./SITE-GATE.md) — which keeps it running so the
> client can still use it. This document is the heavier alternative: the app
> genuinely stopped, with a 503 holding page. Kept because it preserves search
> rankings better over a long closure.

A **fully reversible** takedown of https://kuttystory.co.in. Visitors get an
on-brand 503 holding page; containers stop; **all data survives** — Postgres,
Redis, generated books and uploaded art all live in Docker volumes that are
never touched.

Host: Hostinger VPS `93.127.199.127`, app at `/opt/kuttystory`.

---

## Before you start

Two things are worth checking, because both involve other people's money.

**1. In-flight orders.** Anything mid-generation dies when the worker stops,
and Razorpay webhooks will get connection-refused while the API is down —
a customer can be charged with no order recorded against it.

```bash
cd /opt/kuttystory
docker compose exec db psql -U kutty -d kuttystory \
  -c "select status, count(*) from \"Order\" group by status;" \
  -c "select status, count(*) from \"Job\" group by status;"
```

A job is still in flight if its status is `queued`, `processing` or
`rendering` — let those drain before continuing, or they die mid-render.

Orders need a second look. `pending` means Razorpay hasn't confirmed payment
yet, so those are the ones that can strand a charge. But `paid` and
`in_production` matter just as much in a different way: that customer has paid
and is owed a book. Decide what happens to them before the site goes dark —
they won't be able to reach you through it.

**2. Tell Razorpay.** While the site is down, disable the webhook in the
Razorpay dashboard rather than letting it retry into a dead endpoint and
exhaust its retry budget silently.

---

## Take it down

Order matters. The holding page goes up **first**, so no visitor ever sees a
raw 502 from nginx proxying to a container that just died.

```bash
# --- 1. Ship the holding page (from your laptop) ---
scp infra/maintenance/maintenance.html            root@93.127.199.127:/tmp/
scp infra/nginx/kuttystory.co.in.maintenance.conf root@93.127.199.127:/tmp/

# --- 2. On the VPS ---
ssh root@93.127.199.127

mkdir -p /var/www/maintenance
install -m 644 /tmp/maintenance.html /var/www/maintenance/maintenance.html

# Keep the live vhost so bring-back is a one-line copy, not a git checkout.
cp /etc/nginx/sites-available/kuttystory /etc/nginx/sites-available/kuttystory.live.bak

cp /tmp/kuttystory.co.in.maintenance.conf /etc/nginx/sites-available/kuttystory

# nginx -t is the safety net: reload ONLY runs if the config parses.
nginx -t && systemctl reload nginx

# --- 3. Confirm the page is live BEFORE stopping anything ---
curl -sI https://kuttystory.co.in | head -3      # expect: HTTP/1.1 503 + Retry-After

# --- 4. Now stop the app. `stop`, not `down` — containers and volumes stay. ---
cd /opt/kuttystory
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop

docker compose -f docker-compose.yml -f docker-compose.prod.yml ps   # all Exited
docker volume ls | grep kuttystory                                   # volumes still there
```

`restart: unless-stopped` is exactly the right policy here: a manual `stop`
sticks, so the containers will **not** come back on their own if the VPS
reboots. The site stays down until you deliberately bring it back.

---

## Bring it back

Reverse order — app first, holding page last, so the site only reopens once
it's actually serving.

```bash
ssh root@93.127.199.127
cd /opt/kuttystory

docker compose -f docker-compose.yml -f docker-compose.prod.yml start

# Wait for the API to answer on loopback before reopening the front door.
until curl -sf http://127.0.0.1:8000/health >/dev/null; do sleep 2; done
curl -sf http://127.0.0.1:3000 >/dev/null && echo "web ok"

# Swap the real vhost back.
cp /etc/nginx/sites-available/kuttystory.live.bak /etc/nginx/sites-available/kuttystory
nginx -t && systemctl reload nginx

curl -sI https://kuttystory.co.in | head -3      # expect: HTTP/1.1 200
```

Then re-enable the Razorpay webhook.

> If `kuttystory.live.bak` is ever lost, `infra/nginx/kuttystory.co.in.host.conf`
> in this repo is the same file — copy that over instead.

---

## While the site is dark

**The TLS cert still renews — don't break that.** The maintenance vhost
deliberately keeps a `/.well-known/acme-challenge/` block in *both* the :80 and
:443 servers. The :80 blocks redirect to https, so the challenge lands on :443,
and if that path 503'd like everything else, renewal would fail and the cert
would expire mid-outage. Check it survives:

```bash
certbot renew --dry-run
```

**SEO.** The 503 + `Retry-After` is the correct signal and rankings hold across
a short outage — that's why it isn't a 200 page. This is a grace period, not a
guarantee: past roughly a month of downtime Google will start dropping pages
regardless. If the closure turns out to be long-term or permanent, that's a
different job (301s to wherever the business goes next, or a planned
deindex) — worth revisiting rather than leaving the 503 up indefinitely.

**Backups.** The data is safe from *this* procedure, but it now sits on a
single VPS with nobody looking at it. If the site will be down a while, take a
dump off the box:

```bash
docker compose exec -T db pg_dump -U kutty kuttystory | gzip > kuttystory-$(date +%F).sql.gz
```
