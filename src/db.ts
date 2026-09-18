import type { Env } from './types';

export interface NewEmail {
  id: string;
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  templateKey?: string;
  templateData?: Record<string, unknown>;
  html?: string;
  text?: string;
}

export async function isSuppressed(env: Env, address: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM email_suppressions WHERE address = ?'
  ).bind(address.toLowerCase()).first();
  return row !== null;
}

export async function insertQueuedEmail(env: Env, email: NewEmail): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO emails (id, to_address, from_address, reply_to, subject, template_key, template_data, html_body, text_body, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`
  ).bind(
    email.id,
    email.to,
    email.from,
    email.replyTo ?? null,
    email.subject,
    email.templateKey ?? null,
    email.templateData ? JSON.stringify(email.templateData) : null,
    email.html ?? null,
    email.text ?? null,
  ).run();
}

export async function markSent(env: Env, id: string, provider: string, providerMessageId?: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE emails
     SET status = 'sent', provider = ?, provider_message_id = ?, sent_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).bind(provider, providerMessageId ?? null, id).run();
}

export async function markFailed(env: Env, id: string, provider: string, error: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE emails
     SET status = 'failed', provider = ?, error = ?, attempts = attempts + 1, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(provider, error, id).run();
}

export async function recordEvent(
  env: Env,
  emailId: string,
  eventType: string,
  provider: string,
  rawPayload: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO email_events (email_id, event_type, provider, raw_payload) VALUES (?, ?, ?, ?)`
  ).bind(emailId, eventType, provider, JSON.stringify(rawPayload)).run();
}
