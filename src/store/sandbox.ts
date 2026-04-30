/**
 * Scenario sandbox (Tier 7 #5).
 *
 * Lives entirely in memory — never written to Yjs. When `active` is
 * true, the budget table / forecast / cash flow / RTA all read from
 * a "merged" projection that overlays the user's hypothetical changes
 * onto the live store data.
 *
 * Scope (intentionally narrow — keeps the implementation tractable):
 *   - Override `monthlyIncome` for the current month forward
 *   - Override per-category assignments (this month)
 *   - Add hypothetical scheduled transactions (e.g. "$500 car payment
 *     starting next month") that appear in the cash-flow forecast
 *
 * Apply = run all overlays through repo as real mutations. Discard =
 * clear the slice.
 *
 * Wider scope (per-account balance overrides, custom dates, etc.)
 * deliberately left out for v1 — easier to add than to rip out.
 */

import { create } from 'zustand';
import { newId } from '../domain/id';
import type { Money, RecurrenceFrequency, ScheduledTransaction } from '../domain/types';

export type SandboxAssignment = {
  /** YYYY-MM */
  month: string;
  categoryId: string;
  assigned: Money;
};

export type SandboxScheduled = {
  id: string;
  accountId: string;
  payee: string;
  categoryId: string | null;
  amount: Money; // signed
  memo: string;
  frequency: RecurrenceFrequency;
  startDate: string; // ISO
};

type State = {
  active: boolean;
  /** Optional override of `Settings.monthlyIncome`. */
  monthlyIncomeOverride: Money | null;
  /** Per-(month,category) assignment overrides. */
  assignments: SandboxAssignment[];
  /** Hypothetical scheduled transactions to project into cash flow. */
  scheduled: SandboxScheduled[];

  enter: () => void;
  exit: () => void;
  reset: () => void;

  setMonthlyIncomeOverride: (cents: Money | null) => void;
  upsertAssignment: (a: SandboxAssignment) => void;
  removeAssignment: (month: string, categoryId: string) => void;
  upsertScheduled: (s: SandboxScheduled) => void;
  removeScheduled: (id: string) => void;
};

export const useSandbox = create<State>((set) => ({
  active: false,
  monthlyIncomeOverride: null,
  assignments: [],
  scheduled: [],

  enter: () => set({ active: true }),
  exit: () => set({ active: false }),
  reset: () => set({
    active: false,
    monthlyIncomeOverride: null,
    assignments: [],
    scheduled: [],
  }),

  setMonthlyIncomeOverride: (cents) => set({ monthlyIncomeOverride: cents }),
  upsertAssignment: (a) => set((s) => {
    const filtered = s.assignments.filter((x) => !(x.month === a.month && x.categoryId === a.categoryId));
    return { assignments: [...filtered, a] };
  }),
  removeAssignment: (month, categoryId) => set((s) => ({
    assignments: s.assignments.filter((x) => !(x.month === month && x.categoryId === categoryId)),
  })),
  upsertScheduled: (sx) => set((s) => {
    const filtered = s.scheduled.filter((x) => x.id !== sx.id);
    return { scheduled: [...filtered, sx] };
  }),
  removeScheduled: (id) => set((s) => ({
    scheduled: s.scheduled.filter((x) => x.id !== id),
  })),
}));

/**
 * Convert a sandbox scheduled into a real ScheduledTransaction shape
 * for forecast.ts to consume. The shape is structurally identical;
 * we just need ids, paused=false, etc.
 */
export function sandboxScheduledToReal(s: SandboxScheduled): ScheduledTransaction {
  return {
    id: `sandbox-${s.id}`,
    accountId: s.accountId,
    payeeId: null,
    categoryId: s.categoryId,
    transferAccountId: null,
    amount: s.amount,
    memo: s.memo,
    flag: null,
    frequency: s.frequency,
    startDate: s.startDate,
    nextDate: s.startDate,
    endDate: null,
    lastRunAt: null,
    paused: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Helper used by both the sandbox banner + apply flow. */
export function newSandboxScheduledId(): string {
  return newId();
}
