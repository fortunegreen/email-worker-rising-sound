import type { EmailProvider, OutgoingEmail, SendResult } from '../types';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private apiKey: string) {}

  async send(message: OutgoingEmail): Promise<SendResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `resend ${res.status}: ${await res.text()}` };
    }
    const data = await res.json<{ id: string }>();
    return { ok: true, providerMessageId: data.id };
  }
}
