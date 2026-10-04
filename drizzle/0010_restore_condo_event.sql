INSERT INTO cashflow_events (
  owner_key, kind, label, age, amount_cents, created_at, updated_at
)
SELECT
  '__owner__', 'windfall', 'Condo sale', 50, 15000000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (
  SELECT 1 FROM retirement_plan WHERE owner_key = '__owner__'
)
AND NOT EXISTS (
  SELECT 1 FROM cashflow_events
  WHERE owner_key = '__owner__'
    AND kind = 'windfall'
    AND label = 'Condo sale'
    AND age = 50
    AND amount_cents = 15000000
);