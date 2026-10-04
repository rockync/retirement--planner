import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Actions } from "../../server/src/actions";
import * as schema from "../../server/src/schema";

const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function harness() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE retirement_plan (
      id INTEGER PRIMARY KEY,
      owner_key TEXT NOT NULL UNIQUE,
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
      return_mode TEXT NOT NULL,
      stock_allocation_bps INTEGER NOT NULL,
      bond_allocation_bps INTEGER NOT NULL,
      cash_allocation_bps INTEGER NOT NULL,
      stock_return_bps INTEGER NOT NULL,
      bond_return_bps INTEGER NOT NULL,
      cash_return_bps INTEGER NOT NULL,
      volatility_bps INTEGER NOT NULL,
      inflation_bps INTEGER NOT NULL,
      allocation_stocks_pct REAL,
      allocation_bonds_pct REAL,
      allocation_cash_pct REAL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE cashflow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      age INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const db = drizzle(sqlite, { schema });
  const base = { db: () => db, invalidateQueries: () => undefined };
  return {
    ownerLocal: {
      ...base,
      viewer: { source: "local", authenticated: true, spaceSlug: "retirement-planner", userId: "owner-local", ownerUserId: "owner-local", isOwner: true },
    } as unknown as Parameters<typeof Actions.getPlanner.handler>[0],
    ownerCloudflare: {
      ...base,
      viewer: { source: "cloudflare", authenticated: true, shareId: "share", spaceSlug: "retirement-planner", viewerFbid: "owner-cloud", ownerFbid: "owner-cloud", isOwner: true, tokenExpiresAt: Date.now() + 60_000, tokenId: "token" },
    } as unknown as Parameters<typeof Actions.getPlanner.handler>[0],
    guestLocal: {
      ...base,
      viewer: { source: "local", authenticated: true, spaceSlug: "retirement-planner", userId: "guest-a", ownerUserId: "owner-local", isOwner: false },
    } as unknown as Parameters<typeof Actions.getPlanner.handler>[0],
    guestCloudflare: {
      ...base,
      viewer: { source: "cloudflare", authenticated: true, shareId: "share", spaceSlug: "retirement-planner", viewerFbid: "guest-b", ownerFbid: "owner-cloud", isOwner: false, tokenExpiresAt: Date.now() + 60_000, tokenId: "token" },
    } as unknown as Parameters<typeof Actions.getPlanner.handler>[0],
    anonymous: base as unknown as Parameters<typeof Actions.getPlanner.handler>[0],
  };
}

function savedPlan(currentSavings: number) {
  return {
    currency: "USD" as const,
    current_age: 47,
    retirement_age: 62,
    planning_age: 90,
    current_savings: currentSavings,
    annual_contribution: 36_000,
    desired_income: 144_000,
    social_security_income: 33_600,
    social_security_age: 67,
    return_before: 4,
    return_after: 3,
    return_mode: "manual" as const,
    stock_allocation: 60,
    bond_allocation: 30,
    cash_allocation: 10,
    stock_return: 7,
    bond_return: 3,
    cash_return: 1,
    volatility: 12,
    inflation: 3,
    allocation_stocks_pct: null,
    allocation_bonds_pct: null,
    allocation_cash_pct: null,
  };
}

describe("viewer-scoped private data", () => {
  test("owner identity is stable between local and shared-cloud contexts", async () => {
    const { ownerLocal, ownerCloudflare } = harness();
    expect((await Actions.savePlan.handler(ownerLocal, savedPlan(111))).ok).toBe(true);
    expect((await Actions.getPlanner.handler(ownerCloudflare, {})).plan?.current_savings).toBe(111);
  });

  test("each signed-in viewer sees and changes only that viewer's plan and events", async () => {
    const { ownerLocal, guestLocal, guestCloudflare } = harness();
    await Actions.savePlan.handler(ownerLocal, savedPlan(111));
    const ownerEvent = await Actions.saveEvent.handler(ownerLocal, { kind: "windfall", label: "owner", age: 55, amount: 1_000 });
    await Actions.savePlan.handler(guestLocal, savedPlan(222));
    const guestEvent = await Actions.saveEvent.handler(guestLocal, { kind: "expense", label: "guest", age: 70, amount: 500 });

    expect((await Actions.getPlanner.handler(ownerLocal, {})).plan?.current_savings).toBe(111);
    expect((await Actions.getPlanner.handler(ownerLocal, {})).events.map((event) => event.label)).toEqual(["owner"]);
    expect((await Actions.getPlanner.handler(guestLocal, {})).plan?.current_savings).toBe(222);
    expect((await Actions.getPlanner.handler(guestLocal, {})).events.map((event) => event.label)).toEqual(["guest"]);
    expect((await Actions.getPlanner.handler(guestCloudflare, {})).plan).toBeNull();
    expect((await Actions.getPlanner.handler(guestCloudflare, {})).events).toEqual([]);

    if (!ownerEvent.id || !guestEvent.id) throw new Error("Expected event IDs.");
    expect((await Actions.saveEvent.handler(guestLocal, { id: ownerEvent.id, kind: "expense", label: "hijack", age: 60, amount: 1 })).ok).toBe(false);
    await Actions.deleteEvent.handler(guestLocal, { id: ownerEvent.id });
    expect((await Actions.getPlanner.handler(ownerLocal, {})).events.map((event) => event.label)).toEqual(["owner"]);
  });

  test("missing authenticated viewer never falls back to the owner's rows", async () => {
    const { ownerLocal, anonymous } = harness();
    await Actions.savePlan.handler(ownerLocal, savedPlan(111));
    const read = await Actions.getPlanner.handler(anonymous, {});
    expect(read.plan).toBeNull();
    expect(read.events).toEqual([]);
    expect(read.access_error).toContain("Sign in");
    expect((await Actions.savePlan.handler(anonymous, savedPlan(999))).ok).toBe(false);
    expect((await Actions.saveEvent.handler(anonymous, { kind: "windfall", label: "blocked", age: 55, amount: 1 })).ok).toBe(false);
  });
});
