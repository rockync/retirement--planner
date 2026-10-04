import { describe, expect, test } from "bun:test";
import {
analyzeEventImpacts,
analyzeSocialSecurityTiming,
calculate,
expectedReturns,
historicalRealReturn,
historicalScenarios,
MAX_MONEY_INPUT,
monthlyWithdrawalCapacity,
monteCarlo,
parseUserNumber,
percentile,
requiredAnnualSavingsScenario,
runHistoricalStress,
seededRandom,
formatSocialSecurityBreakEvenAge,
socialSecurityBenefitAtAge,
socialSecurityBreakEvenAgeVs62,
validatePlanRequest,
type CashEvent,
type Plan,
} from "./App";

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    currency: "USD",
    current_age: 50,
    retirement_age: 60,
    planning_age: 90,
    current_savings: 1_000,
    annual_contribution: 120,
    desired_income: 120,
    social_security_income: 0,
    social_security_age: 60,
    return_before: 0,
    return_after: 0,
    return_mode: "manual",
    stock_allocation: 60,
    bond_allocation: 30,
    cash_allocation: 10,
    stock_return: 7,
    bond_return: 3,
    cash_return: 1,
    volatility: 0,
    inflation: 0,
    allocation_stocks_pct: null,
    allocation_bonds_pct: null,
    allocation_cash_pct: null,
    updated_at: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

function cashEvent(id: number, kind: "windfall" | "expense", age: number, amount: number): CashEvent {
  return {
    id,
    kind,
    label: `${kind}-${id}`,
    age,
    amount,
    created_at: "2026-10-03T00:00:00.000Z",
    updated_at: "2026-10-03T00:00:00.000Z",
  };
}

function expectClose(actual: number, expected: number, tolerance = 1e-6): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function planRequest(overrides: Partial<Parameters<typeof validatePlanRequest>[0]> = {}): Parameters<typeof validatePlanRequest>[0] {
  const { updated_at: _updatedAt, ...request } = plan();
  return { ...request, ...overrides };
}

describe("deterministic projection", () => {
  test("uses one contribution per year through retirement and one withdrawal per year after retirement", () => {
    const result = calculate(plan(), []);
    expect(result.series).toHaveLength(41);
    expect(result.projectedAtRetirement).toBe(2_200);
    expect(result.goalBreakdown.retirementIncomeYears).toBe(30);
    expect(result.requiredAtRetirement).toBe(3_600);
    expect(result.endBalance).toBe(-1_400);
  });

  test("does not count an extra withdrawal at the retirement-date balance", () => {
    const result = calculate(plan({ retirement_age: 89, planning_age: 90, annual_contribution: 0, desired_income: 12_000 }), []);
    expect(result.goalBreakdown.retirementIncomeYears).toBe(1);
    expect(result.requiredAtRetirement).toBe(12_000);
  });

  test("accumulates Social Security received before retirement into the retirement balance", () => {
    const early = calculate(plan({ social_security_income: 120, social_security_age: 58 }), []);
    const atRetirement = calculate(plan({ social_security_income: 120, social_security_age: 60 }), []);
    expect(early.projectedAtRetirement - atRetirement.projectedAtRetirement).toBe(240);
  });

  test("dates a pre-retirement windfall to its age without an extra year of growth", () => {
    const savedPlan = plan({
      current_age: 47,
      retirement_age: 62,
      planning_age: 90,
      current_savings: 0,
      annual_contribution: 0,
      desired_income: 0,
      return_before: 5,
      return_after: 5,
    });
    const result = calculate(savedPlan, [cashEvent(1, "windfall", 55, 200_000)]);
    expectClose(result.projectedAtRetirement, 200_000 * Math.pow(1.05, 7), 0.01);
  });

  test("ignores events at the end-of-horizon age", () => {
    const baseline = calculate(plan(), []);
    const withEndAgeEvent = calculate(plan(), [cashEvent(1, "expense", 90, 1_000_000)]);
    expect(withEndAgeEvent).toEqual(baseline);
  });

  test("does not apply investment returns to an unfunded negative balance", () => {
    const result = calculate(
      plan({ current_savings: 0, annual_contribution: 0, desired_income: 0, return_before: 10, return_after: 10 }),
      [cashEvent(1, "expense", 55, 5_000_000)],
    );
    expect(result.projectedAtRetirement).toBe(-5_000_000);
    expect(result.endBalance).toBe(-5_000_000);
  });

  test("caps Social Security at the income target instead of treating excess benefits as investable surplus", () => {
    const result = calculate(plan({ desired_income: 120, social_security_income: 1_200, social_security_age: 70 }), []);
    expect(result.goalBreakdown.socialSecurityYears).toBe(21);
    expect(result.goalBreakdown.socialSecurityAtRetirement).toBe(21 * 120);
    expect(result.requiredAtRetirement).toBe(9 * 120);
  });

  test("includes both later windfalls and later expenses in the retirement goal", () => {
    const events = [cashEvent(1, "windfall", 70, 200), cashEvent(2, "expense", 80, 500)];
    const result = calculate(plan(), events);
    expect(result.goalBreakdown.postRetirementEventsAtRetirement).toBe(-300);
    expect(result.requiredAtRetirement).toBe(3_900);
    expect(result.endBalance).toBe(-1_700);
  });

  test("discounts later events to retirement at the saved real return", () => {
    const result = calculate(
      plan({ return_after: 5, annual_contribution: 0, desired_income: 0 }),
      [cashEvent(1, "expense", 70, 1_000)],
    );
    expectClose(result.requiredAtRetirement, 1_000 / (1.05 ** 10));
  });

  test("keeps pre-retirement events in the balance without double-counting them in the retirement goal", () => {
    const result = calculate(plan(), [cashEvent(1, "expense", 55, 400)]);
    expect(result.projectedAtRetirement).toBe(1_800);
    expect(result.requiredAtRetirement).toBe(3_600);
    expect(result.goalBreakdown.postRetirementEvents).toHaveLength(0);
  });

  test("uses the portfolio-weighted return in portfolio mode", () => {
    expect(expectedReturns(plan({ return_mode: "portfolio" }))).toEqual({ before: 5.2, after: 5.2 });
  });

  test("applies inflation geometrically to historical nominal returns", () => {
    expectClose(historicalRealReturn(10, 5), (1.1 / 1.05) - 1);
    expect(historicalRealReturn(-100, 20)).toBe(-1);
  });
});

describe("Monte Carlo invariants", () => {
  test("is deterministic for identical inputs", () => {
    const savedPlan = plan({ volatility: 12, return_before: 4, return_after: 3 });
    const first = monteCarlo(savedPlan, [], calculate(savedPlan, []).requiredAtRetirement);
    const second = monteCarlo(savedPlan, [], calculate(savedPlan, []).requiredAtRetirement);
    expect(second).toEqual(first);
  });

  test("does not reroll when only labels, row IDs, order, or display currency change", () => {
    const savedPlan = plan({ volatility: 12, return_before: 4, return_after: 3 });
    const firstEvents = [cashEvent(1, "windfall", 55, 500), cashEvent(2, "expense", 70, 200)];
    const renamedAndReordered = [
      { ...cashEvent(99, "expense", 70, 200), label: "renamed expense" },
      { ...cashEvent(88, "windfall", 55, 500), label: "renamed windfall" },
    ];
    const required = calculate(savedPlan, firstEvents).requiredAtRetirement;
    const first = monteCarlo(savedPlan, firstEvents, required);
    const second = monteCarlo({ ...savedPlan, currency: "EUR" }, renamedAndReordered, required);
    expect(second).toEqual(first);
  });

  test("matches the deterministic projection when volatility is zero", () => {
    const savedPlan = plan({ volatility: 0, return_before: 4, return_after: 3 });
    const projection = calculate(savedPlan, []);
    const simulation = monteCarlo(savedPlan, [], projection.requiredAtRetirement);
    for (let index = 0; index < projection.series.length; index += 1) {
      const expected = projection.series[index]?.balance ?? 0;
      const band = simulation.bands[index];
      expect(band).toBeDefined();
      expectClose(band?.p10 ?? 0, expected, 1e-5);
      expectClose(band?.p50 ?? 0, expected, 1e-5);
      expectClose(band?.average ?? 0, expected, 1e-5);
      expectClose(band?.p90 ?? 0, expected, 1e-5);
    }
  });

  test("keeps percentile bands ordered and produces finite values across the maximum horizon", () => {
    const savedPlan = plan({ current_age: 18, retirement_age: 100, planning_age: 120, volatility: 50, return_before: -20, return_after: -20 });
    const simulation = monteCarlo(savedPlan, [], calculate(savedPlan, []).requiredAtRetirement);
    expect(simulation.bands).toHaveLength(103);
    for (const band of simulation.bands) {
      expect(Number.isFinite(band.p10)).toBe(true);
      expect(Number.isFinite(band.p50)).toBe(true);
      expect(Number.isFinite(band.p90)).toBe(true);
      expect(band.p10).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p90);
    }
  });

  test("reports exact 0% and 100% probabilities for deterministic misses and hits", () => {
    const savedPlan = plan({ volatility: 0 });
    expect(monteCarlo(savedPlan, [], 2_201).probability).toBe(0);
    expect(monteCarlo(savedPlan, [], 2_200).probability).toBe(100);
  });

  test("seed generator and percentile boundaries are stable", () => {
    const a = seededRandom("same-seed");
    const b = seededRandom("same-seed");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([1, 2, 3], -10)).toBe(1);
    expect(percentile([1, 2, 3], 10)).toBe(3);
  });
});

describe("Social Security timing analysis", () => {
  test("preserves statement anchors and applies SSA monthly adjustments at intervening ages", () => {
    expect([
      socialSecurityBenefitAtAge(62),
      socialSecurityBenefitAtAge(63),
      socialSecurityBenefitAtAge(64),
      socialSecurityBenefitAtAge(65),
      socialSecurityBenefitAtAge(66),
      socialSecurityBenefitAtAge(67),
      socialSecurityBenefitAtAge(68),
      socialSecurityBenefitAtAge(69),
      socialSecurityBenefitAtAge(70),
    ]).toEqual([2_854, 3_049, 3_252, 3_523, 3_794, 4_065, 4_390, 4_715, 5_040]);
    expect(Number.isNaN(socialSecurityBenefitAtAge(61))).toBe(true);
    expect(Number.isNaN(socialSecurityBenefitAtAge(67.5))).toBe(true);
  });

  test("calculates monthly and lifetime Social Security-only figures through the active horizon", () => {
    const rows = analyzeSocialSecurityTiming(plan({ current_age: 50, retirement_age: 60, planning_age: 90 }));
    expect(rows.map((row) => row.claimingAge)).toEqual([62, 63, 64, 65, 66, 67, 68, 69, 70]);
    for (const row of rows) {
      expect(row.lifetimeBenefits).toBe(row.monthlyBenefit * 12 * (90 - row.claimingAge));
    }
    expect(rows.find((row) => row.claimingAge === 62)?.lifetimeBenefits).toBe(2_854 * 12 * 28);
    expect(rows.find((row) => row.claimingAge === 70)?.lifetimeBenefits).toBe(5_040 * 12 * 20);
  });

  test("excludes claiming ages before retirement from the comparison and optimization", () => {
    const rows = analyzeSocialSecurityTiming(plan({ current_age: 50, retirement_age: 67, planning_age: 90 }));
    expect(rows.map((row) => row.claimingAge)).toEqual([67, 68, 69, 70]);
  });

  test("computes cumulative-benefit break-even ages against claiming at 62", () => {
    expect(socialSecurityBreakEvenAgeVs62(62)).toBeNull();
    expectClose(
      socialSecurityBreakEvenAgeVs62(67) ?? 0,
      67 + (2_854 * 60) / (4_065 - 2_854) / 12,
    );
    expect(formatSocialSecurityBreakEvenAge(socialSecurityBreakEvenAgeVs62(67) ?? 0)).toBe("Age 78 yr 9 mo");
    expect(socialSecurityBreakEvenAgeVs62(61)).toBeNull();
    expect(socialSecurityBreakEvenAgeVs62(67.5)).toBeNull();
  });

  test("keeps SSA calculations in USD even when the rest of the plan uses another currency", () => {
    const rows = analyzeSocialSecurityTiming(plan({ currency: "EUR", retirement_age: 62, planning_age: 90 }));
    expect(rows[0]?.monthlyBenefit).toBe(2_854);
    expect(rows[0]?.lifetimeBenefits).toBe(2_854 * 12 * 28);
  });

  test("does not fabricate lifetime benefits for a claiming age that has already passed", () => {
    const older = analyzeSocialSecurityTiming(plan({ current_age: 68, retirement_age: 67, planning_age: 90 }));
    expect(older.map((row) => row.claimingAge)).toEqual([67, 68, 69, 70]);
    expect(older[0]?.lifetimeBenefits).toBeNull();
    expect(older[1]?.lifetimeBenefits).toBeNull();
    expect(older[2]?.lifetimeBenefits).toBe(4_715 * 12 * 21);
  });
});

describe("income and savings solvers", () => {
  test("solves the zero-return monthly withdrawal independently by hand", () => {
    const savedPlan = plan();
    const projection = calculate(savedPlan, []);
    const result = monthlyWithdrawalCapacity(
      savedPlan,
      [],
      projection.series.map((point) => ({ age: point.age, value: point.balance })),
      90,
    );
    expect(result).not.toBeNull();
    expectClose(result?.totalMonthlyIncome ?? 0, 2_200 / (30 * 12), 1e-8);
    expectClose(result?.endingBalance ?? 1, 0, 1e-8);
  });

  test("adds Social Security to total income without withdrawing it from the portfolio", () => {
    const savedPlan = plan({ social_security_income: 60, social_security_age: 60 });
    const projection = calculate(savedPlan, []);
    const result = monthlyWithdrawalCapacity(
      savedPlan,
      [],
      projection.series.map((point) => ({ age: point.age, value: point.balance })),
      90,
    );
    expectClose(result?.totalMonthlyIncome ?? 0, (2_200 / (30 * 12)) + 5, 1e-8);
    expectClose(result?.portfolioAfterSocialSecurity ?? 0, 2_200 / (30 * 12), 1e-8);
  });

  test("reports Social Security-only income when the retirement portfolio is exactly zero", () => {
    const savedPlan = plan({
      current_savings: 0,
      annual_contribution: 0,
      desired_income: 33_600,
      social_security_income: 33_600,
      social_security_age: 60,
    });
    const projection = calculate(savedPlan, []);
    const zeroAtRetirementSeries = projection.series.map((point) => ({
      age: point.age,
      value: point.age === savedPlan.retirement_age ? 0 : point.balance,
    }));
    const result = monthlyWithdrawalCapacity(savedPlan, [], zeroAtRetirementSeries, 90);
    expect(result).not.toBeNull();
    expectClose(result?.totalMonthlyIncome ?? 0, 2_800, 1e-8);
    expectClose(result?.portfolioAfterSocialSecurity ?? 1, 0, 1e-8);
    expectClose(result?.endingBalance ?? 1, 0, 1e-8);
  });

  test("rejects a withdrawal horizon with no retirement months", () => {
    const invalid = plan({ retirement_age: 90, planning_age: 90 });
    expect(monthlyWithdrawalCapacity(invalid, [], [{ age: 90, value: 1_000 }], 90)).toBeNull();
  });

  test("solves required savings at zero return by hand", () => {
    const result = requiredAnnualSavingsScenario(plan(), [], 10, 0);
    expect(result).not.toBeNull();
    expect(result?.needAtRetirement).toBe(3_600);
    expect(result?.projectedResources).toBe(1_000);
    expect(result?.shortfall).toBe(2_600);
    expect(result?.requiredAnnualSavings).toBe(260);
  });

  test("includes pre-retirement Social Security in projected retirement resources", () => {
    const result = requiredAnnualSavingsScenario(
      plan({ social_security_income: 120, social_security_age: 58 }),
      [],
      10,
      0,
    );
    expect(result?.projectedResources).toBe(1_240);
  });

  test("includes a later expense and windfall in the savings need", () => {
    const events = [cashEvent(1, "expense", 70, 500), cashEvent(2, "windfall", 80, 200)];
    const result = requiredAnnualSavingsScenario(plan(), events, 10, 0);
    expect(result?.needAtRetirement).toBe(3_900);
    expect(result?.requiredAnnualSavings).toBe(290);
  });

  test("never presents a negative retirement need when later windfalls exceed all outflows", () => {
    const result = requiredAnnualSavingsScenario(
      plan({ current_savings: 0, desired_income: 0 }),
      [cashEvent(1, "windfall", 70, 1_000_000)],
      0,
      0,
    );
    expect(result?.needAtRetirement).toBe(0);
    expect(result?.requiredAnnualSavings).toBe(0);
  });

  test("rejects impossible timelines and out-of-range returns without iterating or hanging", () => {
    expect(requiredAnnualSavingsScenario(plan({ retirement_age: 90, planning_age: 90 }), [], 10, 0)).toBeNull();
    expect(requiredAnnualSavingsScenario(plan(), [], 10, -200)).toBeNull();
    expect(requiredAnnualSavingsScenario(plan(), [], 10, 200)).toBeNull();
    const lowerBound = requiredAnnualSavingsScenario(plan(), [], 10, -20);
    expect(lowerBound).not.toBeNull();
    expect(Number.isFinite(lowerBound?.needAtRetirement)).toBe(true);
    expect(Number.isFinite(lowerBound?.requiredAnnualSavings)).toBe(true);
  });
});

describe("historical stress paths", () => {
  test("begins the historical sequence in the first year after retirement", () => {
    const savedPlan = plan({ current_savings: 100, annual_contribution: 0, desired_income: 0, retirement_age: 60, planning_age: 62 });
    const scenario = historicalScenarios[0];
    const firstYear = scenario.years[0];
    if (!firstYear) throw new Error("Historical scenario must contain at least one year.");
    const result = runHistoricalStress(savedPlan, [], scenario);
    const atRetirement = result.series.find((point) => point.age === 60)?.stress;
    const firstStressYear = result.series.find((point) => point.age === 61)?.stress;
    expect(atRetirement).toBe(100);
    expectClose(firstStressYear ?? 0, 100 * (1 + firstYear.returnPercent / 100));
    expect(result.appliedYears).toBe(2);
  });

  test("keeps all stress outputs finite with expenses and negative returns", () => {
    const savedPlan = plan({ return_before: -20, return_after: -20, inflation: 20 });
    const worstCase = historicalScenarios[4] ?? historicalScenarios[0];
    const result = runHistoricalStress(savedPlan, [cashEvent(1, "expense", 70, 10_000)], worstCase);
    expect(result.series).toHaveLength(41);
    expect(result.series.every((point) => Number.isFinite(point.stress))).toBe(true);
    expect(Number.isFinite(result.endBalance)).toBe(true);
  });
});


describe("second-sweep Monte Carlo coverage", () => {
  test("aggregates exactly 1,000 paths with ordered finite bands and no return-generated negative balances", () => {
    const savedPlan = plan({
      current_age: 18,
      retirement_age: 100,
      planning_age: 120,
      current_savings: 10_000,
      annual_contribution: 0,
      desired_income: 0,
      social_security_income: 0,
      return_before: 30,
      return_after: 30,
      volatility: 50,
    });
    const simulation = monteCarlo(savedPlan, [], 0);
    expect(simulation.runs).toBe(1_000);
    expect(simulation.bands).toHaveLength(103);
    for (const band of simulation.bands) {
      expect([band.p10, band.p50, band.p90, band.average, band.bandWidth].every(Number.isFinite)).toBe(true);
      expect(band.p10).toBeGreaterThanOrEqual(0);
      expect(band.p10).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p90);
      expect(band.bandWidth).toBeGreaterThanOrEqual(0);
    }
  });

  test("has no global RNG leakage when another simulation runs between identical calls", () => {
    const firstPlan = plan({ volatility: 27, return_before: 5, return_after: 2 });
    const otherPlan = plan({ volatility: 41, return_before: -5, return_after: 10, current_savings: 99_999 });
    const required = calculate(firstPlan, []).requiredAtRetirement;
    const first = monteCarlo(firstPlan, [], required);
    monteCarlo(otherPlan, [cashEvent(1, "expense", 70, 10_000)], calculate(otherPlan, []).requiredAtRetirement);
    expect(monteCarlo(firstPlan, [], required)).toEqual(first);
  });
});

describe("second-sweep savings inversion and unit consistency", () => {
  test("inverts a nonzero-return target back to the retirement need", () => {
    const base = plan({
      current_savings: 25_000,
      annual_contribution: 0,
      desired_income: 24_000,
      social_security_income: 6_000,
      social_security_age: 65,
      return_before: 4,
      return_after: 4,
    });
    const events = [cashEvent(1, "windfall", 55, 5_000), cashEvent(2, "expense", 72, 8_000)];
    const solved = requiredAnnualSavingsScenario(base, events, 2_000, 4);
    expect(solved).not.toBeNull();
    const forward = calculate({ ...base, annual_contribution: solved?.requiredAnnualSavings ?? 0 }, events);
    expectClose(forward.projectedAtRetirement, forward.requiredAtRetirement, 0.01);
  });

  test("handles a zero target and an already-funded target as zero required monthly savings", () => {
    const zeroTarget = requiredAnnualSavingsScenario(plan(), [], 0, 4);
    expect(zeroTarget?.needAtRetirement).toBe(0);
    expect(zeroTarget?.requiredAnnualSavings).toBe(0);
    const funded = requiredAnnualSavingsScenario(plan({ current_savings: 10_000_000 }), [], 10, 0);
    expect(funded?.shortfall).toBeLessThan(0);
    expect(funded?.requiredAnnualSavings).toBe(0);
  });

  test("returns promptly with a finite but clearly unsupported savings requirement for an extreme target", () => {
    const result = requiredAnnualSavingsScenario(
      plan({ current_age: 99, retirement_age: 100, planning_age: 120, current_savings: 0, social_security_income: 0 }),
      [],
      MAX_MONEY_INPUT / 12,
      -20,
    );
    expect(result).not.toBeNull();
    expect(Number.isFinite(result?.requiredAnnualSavings)).toBe(true);
    expect(result?.requiredAnnualSavings ?? 0).toBeGreaterThan(MAX_MONEY_INPUT);
  });

  test("keeps monthly and annual savings views within one cent", () => {
    const result = requiredAnnualSavingsScenario(plan(), [], 1234.56, 2);
    expect(result).not.toBeNull();
    const monthly = (result?.requiredAnnualSavings ?? 0) / 12;
    expectClose(monthly * 12, result?.requiredAnnualSavings ?? 0, 0.01);
  });
});

describe("today's-dollar and Social Security consistency", () => {
  test("inflation does not alter deterministic, simulated, or savings-solver real-dollar results", () => {
    const events = [cashEvent(1, "windfall", 55, 500), cashEvent(2, "expense", 70, 200)];
    const zeroInflation = plan({ inflation: 0, volatility: 12, return_before: 4, return_after: 3 });
    const highInflation = { ...zeroInflation, inflation: 20 };
    expect(calculate(highInflation, events)).toEqual(calculate(zeroInflation, events));
    const required = calculate(zeroInflation, events).requiredAtRetirement;
    expect(monteCarlo(highInflation, events, required)).toEqual(monteCarlo(zeroInflation, events, required));
    expect(requiredAnnualSavingsScenario(highInflation, events, 10, 4)).toEqual(requiredAnnualSavingsScenario(zeroInflation, events, 10, 4));
  });

  test("Social Security after the horizon contributes zero and does not reroll the simulation", () => {
    const withoutSocialSecurity = plan({ social_security_income: 0, social_security_age: 91, volatility: 12 });
    const afterHorizon = plan({ social_security_income: 1_000_000, social_security_age: 91, volatility: 12 });
    expect(calculate(afterHorizon, [])).toEqual(calculate(withoutSocialSecurity, []));
    const required = calculate(withoutSocialSecurity, []).requiredAtRetirement;
    expect(monteCarlo(afterHorizon, [], required)).toEqual(monteCarlo(withoutSocialSecurity, [], required));
  });

  test("Social Security starting at retirement is first used for the first retirement withdrawal and stays flat in real dollars", () => {
    const atRetirement = plan({ annual_contribution: 0, desired_income: 1_200, social_security_income: 600, social_security_age: 60 });
    const result = calculate(atRetirement, []);
    expect(result.projectedAtRetirement).toBe(atRetirement.current_savings);
    expect(result.endBalance).toBe(atRetirement.current_savings - 30 * 600);
    expect(calculate({ ...atRetirement, inflation: 20 }, [])).toEqual(result);
  });

  test("Social Security above the income target is capped rather than rejected or invested", () => {
    const savedPlan = plan({ desired_income: 12_000, social_security_income: 120_000, social_security_age: 60 });
    expect(validatePlanRequest(planRequest({ desired_income: 12_000, social_security_income: 120_000, social_security_age: 60 }))).toBeNull();
    const result = calculate(savedPlan, []);
    expect(result.endBalance).toBe(result.projectedAtRetirement);
  });
});

describe("historical sequence completeness and determinism", () => {
  test("uses a short sequence once, then reverts to the saved real return", () => {
    const savedPlan = plan({ current_savings: 100, annual_contribution: 0, desired_income: 0, retirement_age: 60, planning_age: 63, return_after: 10 });
    const shortScenario = { ...historicalScenarios[0], years: [{ year: 2008, returnPercent: -50 }] };
    const first = runHistoricalStress(savedPlan, [], shortScenario);
    const second = runHistoricalStress(savedPlan, [], shortScenario);
    expect(second).toEqual(first);
    expect(first.appliedYears).toBe(1);
    expect(first.stressEndAge).toBe(61);
    expectClose(first.series.find((point) => point.age === 61)?.stress ?? 0, 50);
    expectClose(first.series.find((point) => point.age === 62)?.stress ?? 0, 55);
  });
});

describe("event impact math", () => {
  test("matches a hand-calculated age-55 windfall annuity through age 90", () => {
    const savedPlan = plan({
      current_age: 47,
      retirement_age: 62,
      planning_age: 90,
      current_savings: 0,
      annual_contribution: 0,
      desired_income: 0,
      social_security_income: 0,
      return_before: 5,
      return_after: 5,
    });
    const event = cashEvent(1, "windfall", 55, 200_000);
    const impact = analyzeEventImpacts(savedPlan, [event]).impacts.get(event.id);
    const retirementValue = 200_000 * Math.pow(1.05, 7);
    const monthlyReturn = Math.pow(1.05, 1 / 12) - 1;
    const expectedMonthly = retirementValue * monthlyReturn / (1 - Math.pow(1 + monthlyReturn, -336));

    expectClose(impact?.retirementBalance ?? 0, retirementValue, 0.01);
    expectClose(impact?.monthlyIncome ?? 0, expectedMonthly, 0.01);
    expectClose(expectedMonthly, 1_539.17, 0.01);
  });
});

describe("same-year multi-event interactions", () => {
  test("removes only the selected event when two events share an age", () => {
    const savedPlan = plan({ current_savings: 10_000, annual_contribution: 0, desired_income: 0, return_before: 5, return_after: 5 });
    const first = cashEvent(1, "windfall", 55, 1_000);
    const second = cashEvent(2, "expense", 55, 250);
    const analysis = analyzeEventImpacts(savedPlan, [first, second]);
    const full = calculate(savedPlan, [first, second]);
    expectClose(analysis.impacts.get(first.id)?.endBalance ?? 0, full.endBalance - calculate(savedPlan, [second]).endBalance);
    expectClose(analysis.impacts.get(second.id)?.endBalance ?? 0, full.endBalance - calculate(savedPlan, [first]).endBalance);
    expect(analysis.largeNonAdditivity).toBe(false);
  });

  test("flags large non-additivity when interacting events cross a zero-balance boundary", () => {
    const savedPlan = plan({ current_savings: 0, annual_contribution: 0, desired_income: 0, return_before: 10, return_after: 10 });
    const events = [cashEvent(1, "expense", 55, 1_000), cashEvent(2, "windfall", 56, 1_000)];
    expect(analyzeEventImpacts(savedPlan, events).largeNonAdditivity).toBe(true);
  });
});

describe("explicit numeric input validation", () => {
  test("accepts a planning horizon as low as age 70 when it follows current age and retirement", () => {
    expect(validatePlanRequest(planRequest({ current_age: 50, retirement_age: 60, planning_age: 70, social_security_age: 67 }))).toBeNull();
  });

  test("rejects blank and non-numeric values before calculations", () => {
    expect(Number.isNaN(parseUserNumber(""))).toBe(true);
    expect(Number.isNaN(parseUserNumber("not a number"))).toBe(true);
    expect(parseUserNumber("12,000.50")).toBe(12_000.5);
  });

  test("returns a clear bounded message for every plan numeric category", () => {
    const cases: Array<[Partial<Parameters<typeof validatePlanRequest>[0]>, string]> = [
      [{ current_age: -1 }, "Current age"],
      [{ retirement_age: 49 }, "Retirement age"],
      [{ planning_age: 60 }, "Plan-through age"],
      [{ social_security_age: 91 }, "Social Security start age"],
      [{ current_savings: -1 }, "Current savings"],
      [{ annual_contribution: MAX_MONEY_INPUT + 1 }, "Monthly savings"],
      [{ desired_income: Number.NaN }, "Monthly retirement income target"],
      [{ social_security_income: MAX_MONEY_INPUT + 1 }, "Monthly Social Security"],
      [{ return_before: -200 }, "Real return before retirement"],
      [{ return_after: 200 }, "Real return after retirement"],
      [{ volatility: 200 }, "Annual volatility"],
      [{ inflation: 200 }, "Inflation reference"],
      [{ return_mode: "portfolio", stock_allocation: -1, bond_allocation: 101, cash_allocation: 0 }, "portfolio allocation"],
      [{ return_mode: "portfolio", stock_allocation: 50, bond_allocation: 20, cash_allocation: 20 }, "must total 100%"],
      [{ return_mode: "portfolio", stock_allocation: 60, bond_allocation: 30, cash_allocation: 10, stock_return: 200 }, "Stock real return"],
    ];
    for (const [overrides, expectedMessage] of cases) {
      expect(validatePlanRequest(planRequest(overrides))).toContain(expectedMessage);
    }
  });
});
