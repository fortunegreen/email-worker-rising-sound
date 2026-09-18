import type { Env, EmailProvider } from '../types';
import { ConsoleProvider } from './console';
import { ResendProvider } from './resend';
import { PostmarkProvider } from './postmark';
import { SendGridProvider } from './sendgrid';

// The only file in the project that knows every provider by name.
// Everything else — the queue, the D1 writes, the HTTP routes — only
// ever sees the EmailProvider interface. Settling on a provider later
// means: add the adapter file above (if not already here), fill in its
// secret in wrangler.toml / `wrangler secret put`, and change one env var.
export function getProvider(env: Env): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
      return new ResendProvider(env.RESEND_API_KEY);

    case 'postmark':
      if (!env.POSTMARK_SERVER_TOKEN) throw new Error('POSTMARK_SERVER_TOKEN is not set');
      return new PostmarkProvider(env.POSTMARK_SERVER_TOKEN);

    case 'sendgrid':
      if (!env.SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY is not set');
      return new SendGridProvider(env.SENDGRID_API_KEY);

    case 'console':
    case undefined:
    case '':
      return new ConsoleProvider();

    default:
      throw new Error(`Unknown EMAIL_PROVIDER: "${env.EMAIL_PROVIDER}"`);
  }
}
