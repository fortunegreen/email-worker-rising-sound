# email-worker

Provider-agnostic transactional email on Cloudflare Workers + D1.

## How the abstraction works

- `src/types.ts` defines `EmailProvider` — one `send()` method, that's it.
- `src/providers/*.ts` — one adapter per provider (`resend`, `postmark`,
  `sendgrid`), plus `console.ts`, a no-op dev provider that just logs.
- `src/providers/index.ts` is the only file that imports all of them; it
  picks one based on the `EMAIL_PROVIDER` env var.
- `src/email-service.ts` and `src/index.ts` never import a provider
  directly — they only see the `EmailProvider` interface.

**To switch providers:** set the secret it needs (`wrangler secret put
RESEND_API_KEY`, etc.) and change `EMAIL_PROVIDER` in `wrangler.toml`. No
other code changes. To drop a provider entirely, delete its adapter file
and its `case` in `providers/index.ts`.

D1 (`emails`, `email_events`, `email_suppressions` — see
`migrations/0001_init.sql`) stores everything in provider-neutral shape:
status, provider name used, and the provider's own message id for
correlating webhook events later. Switching providers doesn't touch this
schema or lose history.

## Setup

```bash
npm install
wrangler d1 create email-worker-db   # copy the id into wrangler.toml
npm run db:migrate:local
npm run dev
```

`/send` requires an `x-api-key` header matching the `API_SECRET` secret —
set one in `.dev.vars` for local testing (see `.dev.vars.example`) and with
`wrangler secret put API_SECRET` before deploying. Requests without a
matching header get a 401.

Test it:

```bash
curl -X POST http://localhost:8787/send \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: your_local_api_secret' \
  -d '{"to":"you@example.com","subject":"Hello","text":"Hi there"}'
```

With `EMAIL_PROVIDER = "console"` (the default), this just logs — no
provider account needed yet. Flip the env var once you've picked one.

## Newsletter signup (`POST /subscribe`)

This adds the person directly to a Resend Audience (Resend's contact-list
feature) rather than keeping your own subscriber table — since you've
settled on Resend, this is simpler and lets you send bulk newsletters
straight from Resend's dashboard later if you want.

Setup:

1. In the Resend dashboard, create an Audience (Audiences → Create).
2. Copy its id into `RESEND_AUDIENCE_ID` in `wrangler.toml` (and into
   `.dev.vars` for local testing — see `.dev.vars.example`).

This is a separate, public-facing endpoint — no `x-api-key` on it, since a
key embedded in a public web page isn't really secret. Instead it's
protected by:

- **CORS** — only requests from `ALLOWED_ORIGIN` in `src/index.ts` succeed.
  Set that to your real site's URL before deploying.
- **A honeypot field** — if the request includes a `website` field with any
  value, it's silently rejected as a bot (real visitors never see or fill
  this field; see the form snippet below).

Note: since this always sends a welcome email after adding the contact
(Resend treats re-adding an existing contact as success, not an error),
someone submitting the form twice gets the welcome email twice. Fine for
now — worth revisiting if that becomes a real problem.

Add a form on your site's signup page. Style however you like — the parts
that matter are the hidden `website` field (rename the honeypot's `name`
attribute to something plausible for extra effect) and the `fetch` call:

```html
<form id="signup-form">
  <input type="email" name="email" placeholder="you@example.com" required />
  <input type="text" name="name" placeholder="Name (optional)" />
  <!-- Honeypot: hidden from real users via CSS, bots often fill it anyway -->
  <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">Subscribe</button>
  <p id="signup-message" role="status"></p>
</form>

<script>
  const form = document.getElementById('signup-form');
  const messageEl = document.getElementById('signup-message');
  const button = form.querySelector('button');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    messageEl.textContent = '';
    messageEl.style.color = '';

    try {
      const res = await fetch('https://email-worker.<your-subdomain>.workers.dev/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.value,
          name: form.name.value,
          website: form.website.value, // honeypot
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        messageEl.textContent = "Thanks — check your inbox for a welcome email!";
        messageEl.style.color = 'green';
        form.reset();
      } else {
        messageEl.textContent = data.error || 'Something went wrong. Please try again.';
        messageEl.style.color = 'crimson';
      }
    } catch {
      messageEl.textContent = 'Network error — please try again in a moment.';
      messageEl.style.color = 'crimson';
    } finally {
      button.disabled = false;
    }
  });
</script>
```

Replace `<your-subdomain>` with your actual `workers.dev` URL (or a custom
domain if you attach one later).

## Memberships (Stripe)

Two endpoints plus a webhook handle recurring memberships, backed by a new
`members` table (`migrations/0002_members.sql`).

- **`POST /membership/checkout`** — public, same CORS pattern as `/subscribe`
  and `/contact`. Takes `{ email, name, tier }` where `tier` is `"member"`
  or `"champion"`. Creates a pending row in `members`, starts a Stripe
  Checkout Session (subscription mode), and returns `{ url }` for the
  browser to redirect to.
- **`POST /webhooks/stripe`** — receives Stripe's events. No CORS (Stripe's
  servers call this directly, not a browser) and no `x-api-key` — instead
  it verifies Stripe's own signature on every request using
  `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed` (activates
  the member, sends a welcome email), `customer.subscription.updated`
  (keeps status/renewal date in sync — e.g. flips to `past_due` on a failed
  card), and `customer.subscription.deleted` (marks `canceled`).
- **`GET /members`** — protected by `x-api-key` like `/send`. Returns the
  full member list as JSON. There's no portal yet, so this is how you check
  who's a member for now: `curl -H 'x-api-key: ...' https://email-worker.../members`.

### Setup

1. **In the Stripe dashboard**, create two recurring Products/Prices —
   e.g. "Member" at $20/year and "Champion" at $100/year. Copy each
   Price ID (starts with `price_`).
2. Set `STRIPE_PRICE_MEMBER` and `STRIPE_PRICE_CHAMPION` in `wrangler.toml`
   (and `.dev.vars` for local testing) to those Price IDs.
3. Get your Stripe **Secret key** (Developers → API keys) and set it:
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   ```
4. **After deploying**, go to Stripe → Developers → Webhooks → Add
   endpoint, pointing at `https://email-worker.../webhooks/stripe`, and
   subscribe to: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Stripe gives you a signing secret
   (starts with `whsec_`) for this specific endpoint — set it:
   ```bash
   wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
   (For local testing, use the [Stripe CLI](https://docs.stripe.com/stripe-cli)'s
   `stripe listen --forward-to localhost:8787/webhooks/stripe` — it prints
   a separate `whsec_` value for local use, put that in `.dev.vars` instead.)
5. Use Stripe's test-mode keys and test card numbers
   (`4242 4242 4242 4242`, any future date/CVC) while wiring this up —
   switch to live keys only once you've confirmed the whole flow works.

### Wiring the buttons on the site

Each tier's "Become a member" / "Join as champion" button should call
`/membership/checkout` and redirect to the URL it returns:

```js
async function startCheckout(tier) {
  const res = await fetch("https://email-worker.<your-subdomain>.workers.dev/membership/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, email: userEmail, name: userName }),
  });
  const data = await res.json();
  if (data.ok && data.url) {
    window.location.href = data.url; // redirect to Stripe Checkout
  } else {
    // show data.error
  }
}
```

You'll need an email (and ideally name) from the visitor before calling
this — either a small form right before the tier buttons, or prompt for it
inline. After payment, Stripe redirects back to `/?membership=success` or
`/?membership=cancelled` on your site; you can check `location.search` for
that and show a matching message.

## Adding a provider that's not scaffolded here

1. Copy `src/providers/resend.ts` as a starting point.
2. Implement `send()` against the new provider's API, returning
   `{ ok, providerMessageId }` or `{ ok: false, error }`.
3. Add a secret field to `Env` in `types.ts`.
4. Add a `case` in `providers/index.ts`.
5. Add the secret with `wrangler secret put`, set `EMAIL_PROVIDER`.

## Not included yet (add when you need them)

- Retry/backoff for failed sends (the `attempts`/`max_attempts` columns
  are there for a queue consumer or cron to pick up).
- Webhook endpoints for delivery/open/bounce events (write into
  `email_events`, and into `email_suppressions` on hard bounce/complaint).
- Templating — `template_key`/`template_data` columns exist so you can
  render HTML server-side however you like before calling `sendEmail()`.
