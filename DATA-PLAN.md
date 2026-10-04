# Data Plan

## Context provenance
- “I want to build a retirement planner artifact. It needs to consider my current savings yearly savings, Future wind falls, major expenses, social security income etc. To project my retirement earnings goal” (original request; defines the editable inputs and deterministic projection).
- “Add a Monte Carlo simulation to the retirement planner. Run 1,000 simulations … with a user-editable volatility … defaulting to something reasonable like 12%.” (follow-up request; adds statistical ranges and explicitly authorizes a 12% editable default).
- “Also add a section for history black swan periods…” (follow-up request; adds historical first-decade retirement stress tests, including 1929, 1966, 2000, 2007, and a deliberately synthetic worst-years sequence).
- “Also for returns include option to specify average return manually like now and an option where you use the stock growth project based on portfolio” (follow-up request; adds a selectable manual-return mode and a portfolio-weighted mode using user-entered stock, bond, and cash allocations and expected returns).
- The user confirmed that every monetary input and output should be in today’s dollars; inflation is applied internally to convert nominal return assumptions into real growth.
- No connected-account context applied for portfolio composition; the planner will not infer allocations or growth rates.
- “Add a section on social security timing…” (follow-up request; adds a claiming-age comparison from 62 through 70 using the user-supplied SSA statement prepared 10/03/2026: $2,854/month at 62, $4,065/month at 67, and $5,040/month at 70).

## Tested sources
- https://eco3min.fr/en/sp500-historical-returns-dataset/ — annual S&P 500 total returns with dividends from 1928–2025, sourced from Aswath Damodaran (NYU Stern); the page documents the series and its CSV fields.
- https://eco3min.fr/dataset/sp500-historical-returns.csv — complete annual nominal-return series used to transcribe the fixed 1929–1938, 1966–1975, 2000–2009, and 2007–2016 scenarios and rank the ten worst individual years.

All personal projection values come from values the user enters and saves in the artifact.

## Image slots
Imagery not needed: this is a focused financial planning utility whose primary visual subject is the user’s own projection chart; decorative imagery would compete with the planning task.

## Long-term data behavior
- **Refresh policy**: Recalculate immediately from persisted inputs whenever the artifact opens or the user saves changes; no external refresh.
- **Growth**: One durable plan record plus user-added future events (windfalls and major expenses).
- **Ordering**: Future events sorted chronologically, then by creation order.
- **Time semantics**: Projection uses integer ages as yearly periods. Windfalls and expenses apply at the selected age. Creation and update timestamps are stored as instants and rendered viewer-local.

## Projection model
- Build a deterministic annual series from current age through planning age.
- Every monetary input and output is expressed in today’s dollars. Contributions, withdrawals, Social Security, windfalls, and major expenses are treated as constant real-dollar amounts.
- The user selects either manual expected returns (separate before- and after-retirement rates) or a portfolio-weighted return. Portfolio mode calculates one expected nominal return from user-entered stock, bond, and cash allocations and each asset class’s user-entered expected return; allocations must total 100%, and the weighted rate is used before and after retirement.
- The inflation input is used internally to convert each nominal expected or simulated investment return into a real return: `(1 + nominal return) / (1 + inflation) − 1`.
- Before retirement, each year applies the user’s annual contribution and any scheduled windfalls/expenses in today’s dollars, then the real investment return.
- At and after retirement, Social Security offsets desired income from its chosen start age; scheduled events still apply; remaining balance grows at the real post-retirement return.
- Required savings at retirement is computed from the constant-real-dollar income gap over the selected retirement horizon using the real post-retirement return.
- Run 1,000 deterministic-seeded Monte Carlo paths for each saved plan. Each yearly nominal return is drawn from a normal distribution centered on the selected return model, converted to a real return with the inflation setting, and applied to the real-dollar cash flow, with one editable annual volatility input (12% initial default). The seed derives from the saved assumptions and events, so unchanged inputs produce stable results.
- Display the share of paths whose retirement-age balance meets the estimated retirement goal, the 10th/50th/90th percentile balance bands at each age, and 10th/median/90th ending portfolio values at the planning horizon.
- Charts and headline figures are derived from the same calculated series, with a minimum planning horizon of age 90.
- Social Security timing reruns the expected-return plan for every whole claiming age from 62 through 70. Ages 62, 67, and 70 use the exact estimates from the supplied SSA statement; intervening whole ages use disclosed straight-line interpolation between adjacent supplied anchors, rounded to the nearest dollar. Each row compares the constant monthly total income capacity that ends near $0 at age 90, the saved-target balance at the plan’s end-of-life age, and estimated lifetime benefits through that age. The highlighted age maximizes the first metric. The personal estimates are modeled only when the plan currency is USD; no exchange rate is fabricated.
- For each of the six chart trajectories, calculate the maximum constant monthly portfolio withdrawal from retirement through age 90 that leaves $0, in today’s dollars. Social Security is excluded from that portfolio-withdrawal amount; after age 90, the table assumes income comes only from Social Security.
- A separate solver accepts a user-editable target monthly retirement income (default $10,000 in today’s dollars), offsets it with Social Security when available, and solves per trajectory for the constant annual savings needed from now through retirement to leave $0 at age 90.
- The artifact labels simulation output as a statistical projection, not a prediction, and does not present it as financial advice.
- Historical stress tests begin in the first full retirement year, replay ten annual nominal S&P 500 total returns (including dividends), convert each to a real return with the user’s inflation setting, and then revert to the selected expected return model. Social Security, events, withdrawals, and every displayed balance remain in today’s dollars.
- Four scenarios preserve actual chronology: 1929–1938, 1966–1975, 2000–2009, and 2007–2016. A fifth explicitly labeled synthetic scenario orders the ten worst individual annual returns from 1928–2025 from worst to least-worst; the UI states that this sequence never occurred as one continuous decade.

## Rejected approaches
- **Tried**: Importing bank or investment data.
  **Why rejected**: The request did not authorize connected-account access. Social Security is the exception: the comparison uses only the exact values in the user-supplied SSA statement and disclosed interpolation for missing whole ages.
- **Tried**: Pre-populating a plausible retirement scenario.
  **Why rejected**: That would fabricate user-owned financial records. Only the explicitly requested volatility field receives a 12% editable default.
- **Tried**: Live market-return assumptions.
  **Why rejected**: The user asked for editable assumptions; current market data would not define a personal long-term return distribution.
- **Tried**: Fresh nondeterministic simulation on every render.
  **Why rejected**: Identical saved assumptions should produce stable, reproducible results; a seeded pseudorandom generator preserves Monte Carlo variation without display drift.
