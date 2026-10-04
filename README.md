# Retirement Planner

A personal retirement planning web app: project savings growth, model windfalls
and major expenses, run Monte Carlo simulations, stress-test against historical
returns, optimize Social Security claiming age, and solve for required monthly
savings — all in today's dollars.

## Features

- **Balance projections** — deterministic trajectories (expected growth, linear
  trend) plus Monte Carlo percentiles (10th / median / average / 90th) to an
  adjustable planning horizon (70–120).
- **Monthly income capacity** — the maximum constant monthly income that
  depletes the balance to exactly $0 at the planning age, per trajectory, with
  the Social Security vs portfolio split shown.
- **Windfalls & big expenses** — per-event impact on monthly income capacity,
  retirement-year balance, and end-of-life balance (computed with-vs-without).
- **Savings target** — required total monthly savings to hit the income goal.
- **Historical stress test** — replays historical return sequences over the
  retirement years, with the planned monthly income shown.
- **Social Security timing** — monthly benefit by claiming age (62–70, SSA
  formula), lifetime benefit totals, break-even ages vs 62, and the optimal
  claiming age. Claiming before retirement age is excluded by design.
- **Viewer isolation** — each viewer gets their own plan; no data leaks
  between users.

All figures are in today's dollars with inflation applied internally; all
savings figures are monthly.

## Tech

Bun + TypeScript, React 19 client (`client/`), server actions (`server/`),
Drizzle ORM + SQLite (`drizzle/` migrations, `app.db` at runtime — never
committed).

## Develop

```sh
bun install
bun test        # full regression suite (calculation, Monte Carlo, stress,
                # withdrawal, savings, save/refresh, data isolation)
bun run build   # builds server actions and the client bundle
```

## Notes

- `app.db` holds user plans and is intentionally not tracked; each deployment
  starts empty and migrations in `drizzle/` bring the schema up to date.
- This repo is a snapshot of the app's source. The hosted build is managed
  separately.
