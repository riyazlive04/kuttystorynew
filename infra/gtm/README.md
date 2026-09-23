# Tag Manager container — kuttystory.co.in

Container `GTM-KGPJC2HG`, GA4 property `G-3NKP4KJGRK`, Meta pixel `28079470835079445`.

`kuttystory-container.json` is an importable GTM export holding the tags,
trigger and variables that read what the site reports about itself. The events
themselves come from [`apps/web/src/lib/analytics.ts`](../../apps/web/src/lib/analytics.ts);
this container only decides where they are sent.

## Why the split

Tags live here so a tag can be retuned without a deploy. Three things stay in
the application code instead, because GTM cannot get them right on its own:

- **Purchase de-duplication.** The order page is a link customers reopen. GTM
  fires on every load, so the sale would be counted again each time and Meta
  would learn the wrong price for a customer.
- **Route-change page views.** The site never reloads the document between the
  story, the preview and the checkout. A tag firing on load alone would report
  the whole funnel as one visit to a story page.
- **Event shape.** GA4 wants `items[]`, Meta wants `content_ids`/`contents`.
  Both are emitted from one source so they cannot drift apart.

## Importing

1. GTM → **Admin** → **Import Container** → choose this JSON.
2. Workspace: **Existing**, pick your working one.
3. Import option: **Merge**, and **Rename conflicting tags, triggers and
   variables**. *Not* Overwrite — Overwrite discards the Google tag already in
   the container.
4. Review the preview of what changes, then confirm.

### One change you must make by hand

The existing Google tag for `G-3NKP4KJGRK` sends a page view when it loads.
The site now pushes its own `page_view` on every route change, including the
first. Leave both on and every landing is counted twice.

Open that tag → **Configuration settings** → set
`send_page_view` to **false** (or untick "Send a page view event when this
configuration loads", depending on your GTM version).

The Meta base tag in this import already inits the pixel *without* firing an
automatic PageView, for the same reason.

## Events

| Event | Fires when | Meta equivalent |
|---|---|---|
| `page_view` | Any screen, including SPA route changes | PageView |
| `view_item` | A story page is opened | ViewContent |
| `search` | Catalogue filtered by age or theme | Search |
| `personalize_started` | The personalise wizard is opened | *custom* |
| `personalize_step_completed` | A wizard step is finished | *custom* |
| `photo_uploaded` | An upload lands, with the backend's quality verdict | *custom* |
| `photo_upload_failed` | An upload errors | *custom* |
| `preview_ready` | Generation finishes, with seconds waited | *custom* |
| `preview_failed` | Generation fails, with seconds waited | *custom* |
| `generate_lead` | Name, age and photo submitted | Lead |
| `sign_up` | Phone number verified by OTP | CompleteRegistration |
| `add_to_cart` | A format is chosen on the preview | AddToCart |
| `begin_checkout` | Checkout is reached with a cart | InitiateCheckout |
| `add_payment_info` | Razorpay is opened | AddPaymentInfo |
| `purchase` | Order confirmed — once per order, ever | Purchase |
| `contact` | WhatsApp button tapped | Contact |

Commerce events carry `currency`, `value` and `items[]` with the format as
`item_category`, so the reports show the hardcover/softcover/PDF mix rather
than just a count.

## The three questions this is built to answer

- **Where does the funnel leak?** `personalize_started` → `generate_lead`
  → `preview_ready` → `add_to_cart` → `purchase`. Each gap is a different
  problem with a different fix, and none of them is visible in a page-view
  report.
- **Is generation costing sales?** `preview_failed` as a share of previews, and
  the distribution of `wait_seconds` on `preview_ready` against whether an
  `add_to_cart` followed.
- **Are bad source photos the real constraint?** `quality_verdict` on
  `photo_uploaded`. A book built from a blurry or faceless photo still renders,
  still ships, and comes back as a refund.

## After importing

1. **Preview** mode, then walk the funnel on the live site: story → personalise
   → preview → format → checkout. Each step should show its event with its
   parameters populated.
2. GA4 → **Admin** → **Events**: mark `purchase`, `generate_lead` and
   `add_to_cart` as key events once they appear.
3. Meta **Events Manager** → Test Events: confirm the standard events arrive
   and are not doubled.
4. Register the custom parameters you want to segment by — at least
   `quality_verdict`, `step_name`, `wait_seconds` and `story_slug` — in GA4 →
   Admin → **Custom definitions**. Unregistered parameters are collected but
   cannot be used as a dimension in reports.

Step 4 is easy to skip and then wonder why the data looks empty.

## Not done here

- **Conversions API.** Every event already carries an `event_id`, so a
  server-side Meta call can be de-duplicated against the browser event
  whenever that is built. Nothing needs to change in the container for it.
- **Consent.** No consent gate is wired. Worth revisiting under the DPDP Act
  before doing anything with this data beyond aggregate reporting.
