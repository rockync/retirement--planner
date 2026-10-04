DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE retirement_plan (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL,
  current_age INTEGER NOT NULL,
  retirement_age INTEGER NOT NULL,
  planning_age INTEGER NOT NULL,
  current_savings_cents INTEGER NOT NULL,
  annual_contribution_cents INTEGER NOT NULL,
  desired_income_cents INTEGER NOT NULL,
  social_security_cents INTEGER NOT NULL,
  social_security_age INTEGER NOT NULL,
  return_before_bps INTEGER NOT NULL,
  return_after_bps INTEGER NOT NULL,
  volatility_bps INTEGER NOT NULL,
  inflation_bps INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE cashflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('windfall', 'expense')),
  label TEXT NOT NULL,
  age INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX cashflow_events_age_idx ON cashflow_events(age, id);