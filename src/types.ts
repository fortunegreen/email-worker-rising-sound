export interface Env {
  DB: D1Database;
  EMAIL_PROVIDER: string;      // 'resend' | 'postmark' | 'sendgrid' | 'console'
  DEFAULT_FROM_ADDRESS: string;
  // Add one secret per provider you might use; unused ones can be blank.
  RESEND_API_KEY?: string;
  RESEND_AUDIENCE_ID?: string;   // required if using /subscribe
  POSTMARK_SERVER_TOKEN?: string;
  SENDGRID_API_KEY?: string;
  API_SECRET: string;          // required header value for POST /send
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MEMBER?: string;
  STRIPE_PRICE_CHAMPION?: string;
}

export interface OutgoingEmail {
  id: string;
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

// Every provider adapter implements exactly this. The rest of the Worker
// (queueing, retries, D1 writes, the HTTP API) never imports a provider
// SDK directly — it only ever talks to this shape. Swapping providers means
// writing one new file that satisfies this interface and flipping an env var.
export interface EmailProvider {
  readonly name: string;
  send(message: OutgoingEmail): Promise<SendResult>;
}
