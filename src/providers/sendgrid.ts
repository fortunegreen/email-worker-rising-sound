import type { EmailProvider, OutgoingEmail, SendResult } from '../types';

export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid';

  constructor(private apiKey: string) {}

  async send(message: OutgoingEmail): Promise<SendResult> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: message.from },
        reply_to: message.replyTo ? { email: message.replyTo } : undefined,
        subject: message.subject,
        content: [
          message.text ? { type: 'text/plain', value: message.text } : null,
          message.html ? { type: 'text/html', value: message.html } : null,
        ].filter(Boolean),
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `sendgrid ${res.status}: ${await res.text()}` };
    }
    // SendGrid returns the message id in a response header, not the body.
    const providerMessageId = res.headers.get('x-message-id') ?? undefined;
    return { ok: true, providerMessageId };
  }
}
