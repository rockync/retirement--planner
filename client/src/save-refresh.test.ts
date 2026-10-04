import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { spaceQueryClient } from "@hatch/space-sdk/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { Actions } from "../../server/src/actions";
import * as schema from "../../server/src/schema";
import type { api as productionApi } from "./api";

const browser = new Window({ url: "https://retirement-planner.test/" });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLButtonElement: browser.HTMLButtonElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  ResizeObserver: browser.ResizeObserver,
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperties(browser.HTMLElement.prototype, {
  clientWidth: { configurable: true, get: () => 1024 },
  clientHeight: { configurable: true, get: () => 600 },
});
browser.HTMLElement.prototype.getBoundingClientRect = () => ({
  x: 0,
  y: 0,
  width: 1024,
  height: 600,
  top: 0,
  right: 1024,
  bottom: 600,
  left: 0,
  toJSON: () => ({}),
} as unknown as ReturnType<typeof browser.document.body.getBoundingClientRect>);

type ActionContext = Parameters<typeof Actions.savePlan.handler>[0];
type SavePlanRequest = Parameters<typeof Actions.savePlan.handler>[1];
type PlannerClient = typeof productionApi;

type Harness = ReturnType<typeof createHarness>;
type ViewName = "projection" | "simulation" | "stress" | "withdrawal" | "savings";

let mountedRoot: Root | null = null;
let mountedHarness: Harness | null = null;

afterEach(async () => {
  if (mountedRoot) {
    await act(async () => mountedRoot?.unmount());
    mountedRoot = null;
  }
  mountedHarness?.sqlite.close();
  mountedHarness = null;
  browser.document.body.replaceChildren();
});

function createHarness() {
  const sqlite = new Database(":memory:");
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
      return_mode TEXT NOT NULL CHECK (return_mode IN ('manual', 'portfolio')),
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
      kind TEXT NOT NULL CHECK (kind IN ('windfall', 'expense')),
      label TEXT NOT NULL,
      age INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX cashflow_events_age_idx ON cashflow_events(age, id);
  `);
  const database = drizzle(sqlite, { schema });
  let serverInvalidations = 0;
  let plannerReads = 0;
  let sharedInputWrites = 0;
  const context = {
    db: () => database,
    viewer: {
      source: "local",
      authenticated: true,
      spaceSlug: "retirement-planner",
      userId: "owner-local-user",
      ownerUserId: "owner-local-user",
      isOwner: true,
    },
    invalidateQueries: () => {
      serverInvalidations += 1;
    },
  } as unknown as ActionContext;

  const client = {
    getPlanner: async (request: Parameters<typeof Actions.getPlanner.handler>[1]) => {
      plannerReads += 1;
      return Actions.getPlanner.handler(context, request);
    },
    savePlanInputs: async (request: Parameters<typeof Actions.savePlanInputs.handler>[1]) => {
      sharedInputWrites += 1;
      return Actions.savePlanInputs.handler(context, request);
    },
    savePlan: (request: Parameters<typeof Actions.savePlan.handler>[1]) => Actions.savePlan.handler(context, request),
    saveEvent: (request: Parameters<typeof Actions.saveEvent.handler>[1]) => Actions.saveEvent.handler(context, request),
    deleteEvent: (request: Parameters<typeof Actions.deleteEvent.handler>[1]) => Actions.deleteEvent.handler(context, request),
  } as PlannerClient;

  return {
    sqlite,
    context,
    client,
    plannerReads: () => plannerReads,
    sharedInputWrites: () => sharedInputWrites,
    serverInvalidations: () => serverInvalidations,
  };
}

const originalPlan: SavePlanRequest = {
  currency: "USD",
  current_age: 47,
  retirement_age: 62,
  planning_age: 90,
  current_savings: 725_432.19,
  annual_contribution: 24_000,
  desired_income: 120_000,
  social_security_income: 36_000,
  social_security_age: 67,
  return_before: 4.25,
  return_after: 3.5,
  return_mode: "manual",
  stock_allocation: 60,
  bond_allocation: 30,
  cash_allocation: 10,
  stock_return: 7,
  bond_return: 3,
  cash_return: 1,
  volatility: 12,
  inflation: 2.5,
  allocation_stocks_pct: 61.5,
  allocation_bonds_pct: 28.25,
  allocation_cash_pct: 10.25,
};

const viewSelectors: Record<ViewName, string> = {
  projection: '[aria-labelledby="projection-heading"]',
  simulation: '[aria-labelledby="simulation-heading"]',
  stress: '[aria-labelledby="stress-heading"]',
  withdrawal: '[aria-labelledby="withdrawal-heading"]',
  savings: '[aria-labelledby="savings-heading"]',
};

function textOf(selector: string): string {
  const element = browser.document.querySelector(selector);
  if (!element) throw new Error(`Expected UI element ${selector}.`);
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function viewSnapshot(): Record<ViewName, string> {
  return {
    projection: textOf(viewSelectors.projection),
    simulation: textOf(viewSelectors.simulation),
    stress: textOf(viewSelectors.stress),
    withdrawal: textOf(viewSelectors.withdrawal),
    savings: textOf(viewSelectors.savings),
  };
}

function input(id: string): HTMLInputElement {
  const element = browser.document.getElementById(id);
  if (!(element instanceof browser.HTMLInputElement)) throw new Error(`Expected input #${id}.`);
  return element as unknown as HTMLInputElement;
}

async function replaceInputValue(id: string, value: string): Promise<void> {
  await act(async () => {
    const element = input(id) as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } };
    const previous = element.value;
    element.value = value;
    // React tracks controlled-input values. Resetting its tracker to the prior
    // value makes this programmatic edit indistinguishable from real typing.
    element._valueTracker?.setValue(previous);
    element.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
    element.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
    await Promise.resolve();
  });
}

async function waitFor(assertion: () => void, timeoutMs = 8_000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for the UI.");
}

async function clickSaveAndAwaitRefetch(harness: Harness): Promise<void> {
  const readsBefore = harness.plannerReads();
  const writesBefore = harness.sharedInputWrites();
  const button = Array.from(browser.document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Save plan inputs",
  );
  if (!(button instanceof browser.HTMLButtonElement)) throw new Error("Expected the actual Save plan inputs control.");

  await act(async () => {
    button.click();
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(harness.sharedInputWrites()).toBe(writesBefore + 1);
    expect(harness.plannerReads()).toBeGreaterThan(readsBefore);
    expect(textOf('[role="status"]')).toContain("Saved — every projection now uses these values.");
  });
}

async function mountPlanner(harness: Harness): Promise<void> {
  const [{ App }, { createRoot }] = await Promise.all([import("./App"), import("react-dom/client")]);
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  spaceQueryClient.clear();
  mountedRoot = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    mountedRoot?.render(
      createElement(
        QueryClientProvider,
        { client: spaceQueryClient },
        createElement(App, { client: harness.client }),
      ),
    );
  });
  await waitFor(() => expect(browser.document.getElementById("withdrawal-monthly-savings")).not.toBeNull());
}

describe("Save and refresh regression through the rendered UI", () => {
  test("the real Save control invalidates, refetches, and independently refreshes every dependent view for every shared input", async () => {
    const harness = createHarness();
    mountedHarness = harness;

    await Actions.savePlan.handler(harness.context, originalPlan);
    await Actions.saveEvent.handler(harness.context, {
      kind: "windfall",
      label: "Land sale",
      age: 55,
      amount: 200_000.25,
    });
    await Actions.saveEvent.handler(harness.context, {
      kind: "expense",
      label: "Home renovation",
      age: 72,
      amount: 48_500.75,
    });
    await mountPlanner(harness);

    const cases: Array<{ id: string; value: string; savedField: keyof SavePlanRequest; expected: number; views: ViewName[] }> = [
      { id: "withdrawal-monthly-savings", value: "3500", savedField: "annual_contribution", expected: 42_000, views: ["projection", "simulation", "stress", "withdrawal"] },
      { id: "withdrawal-monthly-income-target", value: "12500", savedField: "desired_income", expected: 150_000, views: ["projection", "simulation", "stress", "withdrawal", "savings"] },
      { id: "withdrawal-retirement-age", value: "64", savedField: "retirement_age", expected: 64, views: ["projection", "simulation", "stress", "withdrawal"] },
      { id: "withdrawal-social-security-age", value: "69", savedField: "social_security_age", expected: 69, views: ["projection", "simulation", "stress", "withdrawal"] },
      { id: "withdrawal-end-age", value: "95", savedField: "planning_age", expected: 95, views: ["projection", "simulation", "stress", "withdrawal"] },
    ];

    const allViews = Object.keys(viewSelectors) as ViewName[];
    for (const testCase of cases) {
      const before = viewSnapshot();
      const eventsBefore = (await Actions.getPlanner.handler(harness.context, {})).events;
      await replaceInputValue(testCase.id, testCase.value);
      await clickSaveAndAwaitRefetch(harness);

      const durable = await Actions.getPlanner.handler(harness.context, {});
      expect(durable.plan?.[testCase.savedField]).toBe(testCase.expected);
      expect(durable.events).toEqual(eventsBefore);

      const after = viewSnapshot();
      for (const view of testCase.views) {
        expect(after[view]).not.toBe(before[view]);
      }
      // The savings scenario intentionally owns its timeline and ignores the
      // saved contribution; assert that those independent controls do not drift.
      for (const view of allViews.filter((view) => !testCase.views.includes(view))) {
        expect(after[view]).toBe(before[view]);
      }
    }

    expect(harness.sharedInputWrites()).toBe(cases.length);
    // Three setup writes plus one server invalidation per UI save prove that
    // both the durable action and the client-side query/refetch path executed.
    expect(harness.serverInvalidations()).toBe(3 + cases.length);
  }, 20_000);
});
