DELETE FROM cashflow_events
WHERE owner_key = '__owner__'
  AND kind = 'windfall'
  AND label = 'Condo sale'
  AND age = 50
  AND amount_cents = 15000000;