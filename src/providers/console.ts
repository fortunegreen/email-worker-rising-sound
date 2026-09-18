import type { EmailProvider, OutgoingEmail, SendResult } from '../types';

// Logs instead of sending. Good default while you're still building
// everything else and haven't opened a provider account yet — flip
// EMAIL_PROVIDER to a real one later with no other code changes.
export class ConsoleProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: OutgoingEmail): Promise<SendResult> {
    console.log('[console-provider] would send email', {
      to: message.to,
      from: message.from,
      subject: message.subject,
    });
    return { ok: true, providerMessageId: `console-${message.id}` };
  }
}
