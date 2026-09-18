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
