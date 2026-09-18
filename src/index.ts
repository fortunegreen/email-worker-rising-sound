import type { Env } from './types';
import { sendEmail } from './email-service';
import { addResendContact } from './resend-contacts';

// Set these to your real site(s) so only they can call /subscribe from a
// browser. Add/remove entries as your dev and production URLs change.
const ALLOWED_ORIGINS = [
  'https://risingsoundwa.com.au',
  'https://rising-sound-wa-website.misty-recipe-db89.workers.dev',
];

function withCors(response: Response, requestOrigin: string | null): Response {
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS' && url.pathname === '/subscribe') {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    if (request.method === 'POST' && url.pathname === '/subscribe') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return withCors(Response.json({ error: 'invalid JSON body' }, { status: 400 }), origin);
      }

      // Honeypot: a hidden field real visitors never fill in. If a bot fills
      // every field on the form (as scrapers often do), reject silently.
      if (body.website) {
        return withCors(Response.json({ ok: true }), origin);
      }

      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email || !email.includes('@')) {
        return withCors(Response.json({ error: 'a valid email is required' }, { status: 400 }), origin);
      }

      if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID) {
        return withCors(Response.json({ error: 'server misconfigured: missing Resend audience config' }, { status: 500 }), origin);
      }

      const result = await addResendContact(env.RESEND_API_KEY, env.RESEND_AUDIENCE_ID, email, body.name);
      if (!result.ok) {
        return withCors(Response.json({ error: result.error }, { status: 502 }), origin);
      }

      await sendEmail(env, {
        to: email,
        subject: 'Welcome!',
        html: `<p>Thanks for subscribing${body.name ? `, ${body.name}` : ''}!</p>`,
        text: `Thanks for subscribing${body.name ? `, ${body.name}` : ''}!`,
      });

      return withCors(Response.json({ ok: true }), origin);
    }

    if (request.method === 'POST' && url.pathname === '/send') {
      const providedSecret = request.headers.get('x-api-key');
      if (!env.API_SECRET || providedSecret !== env.API_SECRET) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      let body: any;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid JSON body' }, { status: 400 });
      }

      if (!body.to || !body.subject || (!body.html && !body.text)) {
        return Response.json(
          { error: 'to, subject, and one of html/text are required' },
          { status: 400 },
        );
      }

      const outcome = await sendEmail(env, {
        to: body.to,
        subject: body.subject,
        html: body.html,
        text: body.text,
        from: body.from,
        replyTo: body.replyTo,
        templateKey: body.templateKey,
        templateData: body.templateData,
      });

      const status = outcome.status === 'failed' ? 502 : 200;
      return Response.json(outcome, { status });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, provider: env.EMAIL_PROVIDER || 'console' });
    }

    return new Response('Not found', { status: 404 });
  },
};
