import { defineAction, z, type ActionsModule, type PortableCtx } from "@hatch/space-sdk";
import { and, asc, eq } from "drizzle-orm";
import * as schema from "./schema";

const currencySchema = z.enum(["USD", "INR", "EUR", "GBP", "CAD", "AUD"]);
const returnModeSchema = z.enum(["manual", "portfolio"]);
const planInput = z
  .object({
    currency: currencySchema,
    current_age: z.number().int().min(18).max(99),
    retirement_age: z.number().int().min(19).max(100),
    planning_age: z.number().int().min(70).max(120),
    current_savings: z.number().finite().min(0).max(1_000_000_000_000),
    annual_contribution: z.number().finite().min(0).max(1_000_000_000_000),
    desired_income: z.number().finite().min(0).max(1_000_000_000_000),
    social_security_income: z.number().finite().min(0).max(1_000_000_000_000),
    social_security_age: z.number().int().min(19).max(100),
    return_before: z.number().finite().min(-20).max(30),
    return_after: z.number().finite().min(-20).max(30),
    return_mode: returnModeSchema.default("manual"),
    stock_allocation: z.number().finite().min(0).max(100).default(0),
    bond_allocation: z.number().finite().min(0).max(100).default(0),
    cash_allocation: z.number().finite().min(0).max(100).default(0),
    stock_return: z.number().finite().min(-20).max(30).default(0),
    bond_return: z.number().finite().min(-20).max(30).default(0),
    cash_return: z.number().finite().min(-20).max(30).default(0),
    volatility: z.number().finite().min(0).max(50).default(12),
    inflation: z.number().finite().min(0).max(20),
    allocation_stocks_pct: z.number().finite().min(0).max(100).nullable().default(null),
    allocation_bonds_pct: z.number().finite().min(0).max(100).nullable().default(null),
    allocation_cash_pct: z.number().finite().min(0).max(100).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.retirement_age <= value.current_age) {
      ctx.addIssue({ code: "custom", message: "Retirement age must be after current age", path: ["retirement_age"] });
    }
    if (value.planning_age <= value.current_age || value.planning_age <= value.retirement_age) {
      ctx.addIssue({ code: "custom", message: "Plan-through age must be after both current age and retirement age", path: ["planning_age"] });
    }
    if (value.social_security_age <= value.current_age || value.social_security_age > value.planning_age) {
      ctx.addIssue({ code: "custom", message: "Social Security start age must be after current age and no later than the planning age", path: ["social_security_age"] });
    }
    if (value.return_mode === "portfolio") {
      const totalAllocation = value.stock_allocation + value.bond_allocation + value.cash_allocation;
      if (Math.abs(totalAllocation - 100) > 0.01) {
        ctx.addIssue({ code: "custom", message: "Portfolio allocations must total 100%", path: ["stock_allocation"] });
      }
    }
  });

const planResponse = z.object({
  currency: currencySchema,
  current_age: z.number(),
  retirement_age: z.number(),
  planning_age: z.number(),
  current_savings: z.number(),
  annual_contribution: z.number(),
  desired_income: z.number(),
  social_security_income: z.number(),
  social_security_age: z.number(),
  return_before: z.number(),
  return_after: z.number(),
  return_mode: returnModeSchema,
  stock_allocation: z.number(),
  bond_allocation: z.number(),
  cash_allocation: z.number(),
  stock_return: z.number(),
  bond_return: z.number(),
  cash_return: z.number(),
  volatility: z.number(),
  inflation: z.number(),
  allocation_stocks_pct: z.number().nullable(),
  allocation_bonds_pct: z.number().nullable(),
  allocation_cash_pct: z.number().nullable(),
  updated_at: z.string(),
});

const eventResponse = z.object({
  id: z.number(),
  kind: z.enum(["windfall", "expense"]),
  label: z.string(),
  age: z.number(),
  amount: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

function cents(value: number): number {
  return Math.round(value * 100);
}

const OWNER_KEY = "__owner__";

function viewerKey(ctx: PortableCtx): string | null {
  const viewer = ctx.viewer;
  if (!viewer) return null;
  if (viewer.isOwner) return OWNER_KEY;
  return viewer.source === "local" ? `local:${viewer.userId}` : `cloudflare:${viewer.viewerFbid}`;
}

const signInError = "Sign in to open and save your private retirement plan.";

export const Actions = {
  getPlanner: defineAction({
    request: z.object({}),
    response: z.object({
      plan: planResponse.nullable(),
      events: z.array(eventResponse),
      access_error: z.string().nullable(),
    }),
    async handler(ctx) {
      const ownerKey = viewerKey(ctx);
      if (!ownerKey) return { plan: null, events: [], access_error: signInError };
      const db = ctx.db<typeof schema>();
      const [plans, events] = await Promise.all([
        db.select().from(schema.retirementPlan).where(eq(schema.retirementPlan.ownerKey, ownerKey)).limit(1),
        db.select().from(schema.cashflowEvents).where(eq(schema.cashflowEvents.ownerKey, ownerKey)).orderBy(asc(schema.cashflowEvents.age), asc(schema.cashflowEvents.id)),
      ]);
      const plan = plans[0];
      return {
        plan: plan
          ? {
              currency: plan.currency,
              current_age: plan.currentAge,
              retirement_age: plan.retirementAge,
              planning_age: plan.planningAge,
              current_savings: plan.currentSavingsCents / 100,
              annual_contribution: plan.annualContributionCents / 100,
              desired_income: plan.desiredIncomeCents / 100,
              social_security_income: plan.socialSecurityCents / 100,
              social_security_age: plan.socialSecurityAge,
              return_before: plan.returnBeforeBps / 100,
              return_after: plan.returnAfterBps / 100,
              return_mode: plan.returnMode,
              stock_allocation: plan.stockAllocationBps / 100,
              bond_allocation: plan.bondAllocationBps / 100,
              cash_allocation: plan.cashAllocationBps / 100,
              stock_return: plan.stockReturnBps / 100,
              bond_return: plan.bondReturnBps / 100,
              cash_return: plan.cashReturnBps / 100,
              volatility: plan.volatilityBps / 100,
              inflation: plan.inflationBps / 100,
              allocation_stocks_pct: plan.allocationStocksPct,
              allocation_bonds_pct: plan.allocationBondsPct,
              allocation_cash_pct: plan.allocationCashPct,
              updated_at: plan.updatedAt.toISOString(),
            }
          : null,
        events: events.map((event) => ({
          id: event.id,
          kind: event.kind,
          label: event.label,
          age: event.age,
          amount: event.amountCents / 100,
          created_at: event.createdAt.toISOString(),
          updated_at: event.updatedAt.toISOString(),
        })),
        access_error: null,
      };
    },
  }),

  savePlanInputs: defineAction({
    request: z.object({
      annual_contribution: z.number().finite().min(0).max(1_000_000_000_000),
      desired_income: z.number().finite().min(0).max(1_000_000_000_000),
      retirement_age: z.number().int().min(19).max(100),
      social_security_age: z.number().int().min(19).max(100),
      planning_age: z.number().int().min(70).max(120),
    }),
    response: z.object({ ok: z.boolean(), updated_at: z.string().optional(), error: z.string().optional() }),
    async handler(ctx, args) {
      const ownerKey = viewerKey(ctx);
      if (!ownerKey) return { ok: false, error: signInError };
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.retirementPlan).where(eq(schema.retirementPlan.ownerKey, ownerKey)).limit(1);
      const savedPlan = rows[0];
      if (!savedPlan) return { ok: false, error: "Save the full plan before updating these inputs." };
      if (args.retirement_age <= savedPlan.currentAge) {
        return { ok: false, error: `Retirement age must be after ${savedPlan.currentAge}.` };
      }
      if (args.planning_age <= savedPlan.currentAge || args.planning_age <= args.retirement_age) {
        return { ok: false, error: `Plan-through age must be after both current age ${savedPlan.currentAge} and retirement age ${args.retirement_age}.` };
      }
      if (args.social_security_age <= savedPlan.currentAge || args.social_security_age > args.planning_age) {
        return { ok: false, error: `Social Security must start after age ${savedPlan.currentAge} and no later than the end-of-life age.` };
      }

      const now = new Date();
      // This dashboard action deliberately updates only the five shared fields
      // exposed by its controls. Returns, portfolio assumptions, balances, and
      // every other saved field remain untouched in the database.
      await db
        .update(schema.retirementPlan)
        .set({
          annualContributionCents: cents(args.annual_contribution),
          desiredIncomeCents: cents(args.desired_income),
          retirementAge: args.retirement_age,
          socialSecurityAge: args.social_security_age,
          planningAge: args.planning_age,
          updatedAt: now,
        })
        .where(and(eq(schema.retirementPlan.id, savedPlan.id), eq(schema.retirementPlan.ownerKey, ownerKey)));
      ctx.invalidateQueries();
      return { ok: true, updated_at: now.toISOString() };
    },
  }),

  savePlan: defineAction({
    request: planInput,
    response: z.object({ ok: z.boolean(), updated_at: z.string().optional(), error: z.string().optional() }),
    async handler(ctx, args) {
      const ownerKey = viewerKey(ctx);
      if (!ownerKey) return { ok: false, error: signInError };
      const db = ctx.db<typeof schema>();
      const now = new Date();
      const values = {
        ownerKey,
        currency: args.currency,
        currentAge: args.current_age,
        retirementAge: args.retirement_age,
        planningAge: args.planning_age,
        currentSavingsCents: cents(args.current_savings),
        annualContributionCents: cents(args.annual_contribution),
        desiredIncomeCents: cents(args.desired_income),
        socialSecurityCents: cents(args.social_security_income),
        socialSecurityAge: args.social_security_age,
        returnBeforeBps: Math.round(args.return_before * 100),
        returnAfterBps: Math.round(args.return_after * 100),
        returnMode: args.return_mode,
        stockAllocationBps: Math.round(args.stock_allocation * 100),
        bondAllocationBps: Math.round(args.bond_allocation * 100),
        cashAllocationBps: Math.round(args.cash_allocation * 100),
        stockReturnBps: Math.round(args.stock_return * 100),
        bondReturnBps: Math.round(args.bond_return * 100),
        cashReturnBps: Math.round(args.cash_return * 100),
        volatilityBps: Math.round(args.volatility * 100),
        inflationBps: Math.round(args.inflation * 100),
        allocationStocksPct: args.allocation_stocks_pct,
        allocationBondsPct: args.allocation_bonds_pct,
        allocationCashPct: args.allocation_cash_pct,
        updatedAt: now,
      };
      await db
        .insert(schema.retirementPlan)
        .values(values)
        .onConflictDoUpdate({ target: schema.retirementPlan.ownerKey, set: values });
      ctx.invalidateQueries();
      return { ok: true, updated_at: now.toISOString() };
    },
  }),

  saveEvent: defineAction({
    request: z.object({
      id: z.number().int().positive().optional(),
      kind: z.enum(["windfall", "expense"]),
      label: z.string().trim().min(1).max(80),
      age: z.number().int().min(19).max(120),
      amount: z.number().finite().positive().max(1_000_000_000_000),
    }),
    response: z.object({ ok: z.boolean(), id: z.number().optional(), error: z.string().optional() }),
    async handler(ctx, args) {
      const ownerKey = viewerKey(ctx);
      if (!ownerKey) return { ok: false, error: signInError };
      const db = ctx.db<typeof schema>();
      const planRows = await db.select().from(schema.retirementPlan).where(eq(schema.retirementPlan.ownerKey, ownerKey)).limit(1);
      const plan = planRows[0];
      if (!plan) return { ok: false, error: "Save your plan before adding future events." };
      if (args.age <= plan.currentAge || args.age >= plan.planningAge) {
        return { ok: false, error: `Choose an age from ${plan.currentAge + 1} through ${plan.planningAge - 1}. Events at the end-of-horizon age have no effect.` };
      }
      const now = new Date();
      if (args.id) {
        const updated = await db
          .update(schema.cashflowEvents)
          .set({ kind: args.kind, label: args.label.trim(), age: args.age, amountCents: cents(args.amount), updatedAt: now })
          .where(and(eq(schema.cashflowEvents.id, args.id), eq(schema.cashflowEvents.ownerKey, ownerKey)))
          .returning({ id: schema.cashflowEvents.id });
        const row = updated[0];
        if (!row) return { ok: false, error: "That future event no longer exists." };
        ctx.invalidateQueries();
        return { ok: true, id: row.id };
      }
      const inserted = await db
        .insert(schema.cashflowEvents)
        .values({ ownerKey, kind: args.kind, label: args.label.trim(), age: args.age, amountCents: cents(args.amount), createdAt: now, updatedAt: now })
        .returning({ id: schema.cashflowEvents.id });
      const row = inserted[0];
      if (!row) return { ok: false, error: "The event could not be saved." };
      ctx.invalidateQueries();
      return { ok: true, id: row.id };
    },
  }),

  deleteEvent: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), error: z.string().optional() }),
    async handler(ctx, args) {
      const ownerKey = viewerKey(ctx);
      if (!ownerKey) return { ok: false, error: signInError };
      const db = ctx.db<typeof schema>();
      await db.delete(schema.cashflowEvents).where(and(eq(schema.cashflowEvents.id, args.id), eq(schema.cashflowEvents.ownerKey, ownerKey)));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
