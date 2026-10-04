CREATE TABLE retirement_plan_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
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
  return_mode TEXT NOT NULL DEFAULT 'manual' CHECK (return_mode IN ('manual', 'portfolio')),
  stock_allocation_bps INTEGER NOT NULL DEFAULT 0,
  bond_allocation_bps INTEGER NOT NULL DEFAULT 0,
  cash_allocation_bps INTEGER NOT NULL DEFAULT 0,
  stock_return_bps INTEGER NOT NULL DEFAULT 0,
  bond_return_bps INTEGER NOT NULL DEFAULT 0,
  cash_return_bps INTEGER NOT NULL DEFAULT 0,
  volatility_bps INTEGER NOT NULL,
  inflation_bps INTEGER NOT NULL,
  allocation_stocks_pct REAL,
  allocation_bonds_pct REAL,
  allocation_cash_pct REAL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO retirement_plan_next (
  id, owner_key, currency, current_age, retirement_age, planning_age,
  current_savings_cents, annual_contribution_cents, desired_income_cents,
  social_security_cents, social_security_age, return_before_bps,
  return_after_bps, return_mode, stock_allocation_bps, bond_allocation_bps,
  cash_allocation_bps, stock_return_bps, bond_return_bps, cash_return_bps,
  volatility_bps, inflation_bps, allocation_stocks_pct,
  allocation_bonds_pct, allocation_cash_pct, updated_at
)
SELECT
  id, owner_key, currency, current_age, retirement_age, planning_age,
  current_savings_cents, annual_contribution_cents, desired_income_cents,
  social_security_cents, social_security_age, return_before_bps,
  return_after_bps, return_mode, stock_allocation_bps, bond_allocation_bps,
  cash_allocation_bps, stock_return_bps, bond_return_bps, cash_return_bps,
  volatility_bps, inflation_bps, allocation_stocks_pct,
  allocation_bonds_pct, allocation_cash_pct, updated_at
FROM retirement_plan;
--> statement-breakpoint
DROP TABLE retirement_plan;
--> statement-breakpoint
ALTER TABLE retirement_plan_next RENAME TO retirement_plan;
--> statement-breakpoint
CREATE UNIQUE INDEX retirement_plan_owner_key_unique ON retirement_plan(owner_key);