-- Membership records. One row per person, keyed by email. Tier and status
-- are driven by Stripe webhook events, not set directly by the app, so this
-- table is really a local mirror of "what Stripe says is true" for billing
-- purposes, plus the human-facing fields (name, tier) we care about showing.
CREATE TABLE IF NOT EXISTS members (
  id                     TEXT PRIMARY KEY,             -- uuid, generated on first checkout
  email                  TEXT NOT NULL,
  name                   TEXT,
  tier                   TEXT NOT NULL,                 -- 'member' | 'champion'
  status                 TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active' | 'past_due' | 'canceled'
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  current_period_end     TEXT,                          -- ISO date the current paid period ends
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email ON members (email);
CREATE INDEX IF NOT EXISTS idx_members_stripe_subscription ON members (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members (status);
