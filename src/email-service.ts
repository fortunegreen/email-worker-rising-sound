import type { Env } from './types';
import { getProvider } from './providers';
import { insertQueuedEmail, isSuppressed, markSent, markFailed, type NewEmail } from './db';

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  templateKey?: string;
  templateData?: Record<string, unknown>;
}

export interface SendEmailOutcome {
  id: string;
  status: 'sent' | 'failed' | 'suppressed';
  provider?: string;
  error?: string;
}

// Single entry point the rest of the app calls. Always writes to D1 first
// (so you have a record even if the provider call throws), then sends via
// whichever provider is configured, then updates the row with the outcome.
export async function sendEmail(env: Env, input: SendEmailInput): Promise<SendEmailOutcome> {
  const id = crypto.randomUUID();
  const from = input.from ?? env.DEFAULT_FROM_ADDRESS;

  if (await isSuppressed(env, input.to)) {
    return { id, status: 'suppressed' };
  }

  const record: NewEmail = {
    id,
    to: input.to,
    from,
    replyTo: input.replyTo,
    subject: input.subject,
    templateKey: input.templateKey,
    templateData: input.templateData,
    html: input.html,
    text: input.text,
  };
  await insertQueuedEmail(env, record);

  const provider = getProvider(env);
  const result = await provider.send({
    id,
    to: input.to,
    from,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (result.ok) {
    await markSent(env, id, provider.name, result.providerMessageId);
    return { id, status: 'sent', provider: provider.name };
  } else {
    await markFailed(env, id, provider.name, result.error ?? 'unknown error');
    return { id, status: 'failed', provider: provider.name, error: result.error };
  }
}
