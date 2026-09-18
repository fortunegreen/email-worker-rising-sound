import type { EmailProvider, OutgoingEmail, SendResult } from '../types';

export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark';

  constructor(private serverToken: string) {}

  async send(message: OutgoingEmail): Promise<SendResult> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': this.serverToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        From: message.from,
        To: message.to,
        ReplyTo: message.replyTo,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `postmark ${res.status}: ${await res.text()}` };
    }
    const data = await res.json<{ MessageID: string }>();
    return { ok: true, providerMessageId: data.MessageID };
  }
}
