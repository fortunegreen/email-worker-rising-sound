// Minimal Stripe integration via plain fetch + Web Crypto — no SDK, matching
// the rest of this project's style (see src/providers/*.ts).

export interface CheckoutSessionResult {
  ok: boolean;
  url?: string;
  error?: string;
}

// Stripe's API takes form-encoded bodies, not JSON — easy to trip on if
// you're used to most other APIs. Nested keys use bracket notation.
function toFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export async function createCheckoutSession(
  secretKey: string,
  priceId: string,
  customerEmail: string,
  metadata: Record<string, string>,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutSessionResult> {
  const body: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  for (const [key, value] of Object.entries(metadata)) {
    body[`subscription_data[metadata][${key}]`] = value;
    body[`metadata[${key}]`] = value; // also on the session itself, for convenience
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormBody(body),
  });

  if (!res.ok) {
    return { ok: false, error: `stripe ${res.status}: ${await res.text()}` };
  }
  const data = await res.json<{ url: string }>();
  return { ok: true, url: data.url };
}

// Verifies the `Stripe-Signature` header against the raw request body.
// Must be called with the *raw* body text — not a re-serialized JSON object
// — since the signature covers exact bytes. See:
// https://docs.stripe.com/webhooks#verify-manually
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    }),
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject old signatures to prevent replay attacks.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedHex = [...new Uint8Array(signatureBytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time-ish comparison to avoid timing side channels.
  if (expectedHex.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    mismatch |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
