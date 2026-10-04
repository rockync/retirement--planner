import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const retirementPlan = sqliteTable("retirement_plan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull().unique(),
  currency: text("currency", {
    enum: ["USD", "INR", "EUR", "GBP", "CAD", "AUD"],
  }).notNull(),
  currentAge: integer("current_age").notNull(),
  retirementAge: integer("retirement_age").notNull(),
  planningAge: integer("planning_age").notNull(),
  currentSavingsCents: integer("current_savings_cents").notNull(),
  annualContributionCents: integer("annual_contribution_cents").notNull(),
  desiredIncomeCents: integer("desired_income_cents").notNull(),
  socialSecurityCents: integer("social_security_cents").notNull(),
  socialSecurityAge: integer("social_security_age").notNull(),
  returnBeforeBps: integer("return_before_bps").notNull(),
  returnAfterBps: integer("return_after_bps").notNull(),
  returnMode: text("return_mode", { enum: ["manual", "portfolio"] }).notNull(),
  stockAllocationBps: integer("stock_allocation_bps").notNull(),
  bondAllocationBps: integer("bond_allocation_bps").notNull(),
  cashAllocationBps: integer("cash_allocation_bps").notNull(),
  stockReturnBps: integer("stock_return_bps").notNull(),
  bondReturnBps: integer("bond_return_bps").notNull(),
  cashReturnBps: integer("cash_return_bps").notNull(),
  volatilityBps: integer("volatility_bps").notNull(),
  inflationBps: integer("inflation_bps").notNull(),
  allocationStocksPct: real("allocation_stocks_pct"),
  allocationBondsPct: real("allocation_bonds_pct"),
  allocationCashPct: real("allocation_cash_pct"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const cashflowEvents = sqliteTable("cashflow_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  kind: text("kind", { enum: ["windfall", "expense"] }).notNull(),
  label: text("label").notNull(),
  age: integer("age").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
