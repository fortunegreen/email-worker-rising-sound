import type { Env } from './types';

export interface PendingMember {
  id: string;
  email: string;
  name?: string;
  tier: string;
}

export async function createPendingMember(env: Env, member: PendingMember): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO members (id, email, name, tier, status)
     VALUES (?, ?, ?, ?, 'pending')
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, tier = excluded.tier, updated_at = datetime('now')`
  ).bind(member.id, member.email.toLowerCase(), member.name ?? null, member.tier).run();
}

// Called when checkout.session.completed fires — attaches the Stripe
// customer/subscription ids and flips the record to active.
export async function activateMemberByEmail(
  env: Env,
  email: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE members
     SET status = 'active', stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = datetime('now')
     WHERE email = ?`
  ).bind(stripeCustomerId, stripeSubscriptionId, email.toLowerCase()).run();
}

// Called on subscription.updated / invoice.paid / subscription.deleted —
// these identify the member by Stripe subscription id, not email, since
// that's what the webhook payload gives us directly.
export async function updateMemberBySubscription(
  env: Env,
  stripeSubscriptionId: string,
  status: string,
  currentPeriodEnd?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE members
     SET status = ?, current_period_end = COALESCE(?, current_period_end), updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  ).bind(status, currentPeriodEnd ?? null, stripeSubscriptionId).run();
}

export async function listMembers(env: Env): Promise<unknown[]> {
  const result = await env.DB.prepare(
    `SELECT id, email, name, tier, status, current_period_end, created_at
     FROM members ORDER BY created_at DESC`
  ).all();
  return result.results ?? [];
}
