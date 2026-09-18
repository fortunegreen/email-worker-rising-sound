// Resend's contact-list feature (Audiences). Unlike EmailProvider (the
// swappable send interface), this is Resend-specific on purpose — you
// chose to use their contacts feature directly rather than keep your own
// subscriber list, so this file only makes sense if RESEND is the provider.

export interface AddContactResult {
  ok: boolean;
  error?: string;
}

export async function addResendContact(
  apiKey: string,
  audienceId: string,
  email: string,
  name?: string,
): Promise<AddContactResult> {
  const [firstName, ...rest] = (name ?? '').trim().split(/\s+/).filter(Boolean);

  const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      first_name: firstName || undefined,
      last_name: rest.length ? rest.join(' ') : undefined,
      unsubscribed: false,
    }),
  });

  if (!res.ok) {
    // Resend returns 409 if the contact already exists — treat that as success.
    if (res.status === 409) return { ok: true };
    return { ok: false, error: `resend contacts ${res.status}: ${await res.text()}` };
  }

  return { ok: true };
}
