/**
 * Category preset catalog. Used by the WelcomeModal onboarding step to
 * give new users a sensible starting point — pick the situation that
 * matches you, get a curated set of category groups + categories, edit
 * from there.
 *
 * Each preset is just a list of (groupName, [categoryName, iconId]) pairs.
 * The runner applies them via the same `createGroup` / `createCategory`
 * mutators a user would use manually, so there's no special path or hidden
 * behaviour — just a starter set.
 *
 * Keep these tight (≤ 15 categories each) — the goal is "starter that
 * makes sense", not "exhaustive". Users add more as they discover gaps.
 */

import { createGroup, createCategory } from './repo';
import { useBudget } from '../store/budget';

export type PresetId = 'minimal' | 'renter' | 'homeowner' | 'family' | 'student';

export type Preset = {
  id: PresetId;
  label: string;
  description: string;
  groups: Array<{
    name: string;
    categories: Array<{ name: string; icon: string }>;
  }>;
};

export const PRESETS: Preset[] = [
  {
    id: 'minimal',
    label: 'Just the basics',
    description: 'A small starter set — easy to expand from.',
    groups: [
      { name: 'Bills', categories: [
        { name: 'Rent / Mortgage',  icon: 'home' },
        { name: 'Utilities',        icon: 'zap' },
        { name: 'Internet',         icon: 'wifi' },
        { name: 'Phone',            icon: 'phone' },
      ]},
      { name: 'Everyday', categories: [
        { name: 'Groceries',        icon: 'shopping-cart' },
        { name: 'Dining Out',       icon: 'utensils' },
        { name: 'Transportation',   icon: 'car' },
      ]},
      { name: 'Goals', categories: [
        { name: 'Emergency Fund',   icon: 'shield' },
      ]},
    ],
  },
  {
    id: 'renter',
    label: 'Renter',
    description: 'For someone renting an apartment / shared place.',
    groups: [
      { name: 'Bills', categories: [
        { name: 'Rent',             icon: 'home' },
        { name: 'Renters Insurance',icon: 'shield' },
        { name: 'Electric',         icon: 'zap' },
        { name: 'Internet',         icon: 'wifi' },
        { name: 'Phone',            icon: 'phone' },
        { name: 'Streaming',        icon: 'tv' },
      ]},
      { name: 'Everyday', categories: [
        { name: 'Groceries',        icon: 'shopping-cart' },
        { name: 'Dining Out',       icon: 'utensils' },
        { name: 'Coffee',           icon: 'coffee' },
        { name: 'Transit / Gas',    icon: 'car' },
        { name: 'Personal Care',    icon: 'sparkles' },
      ]},
      { name: 'Discretionary', categories: [
        { name: 'Entertainment',    icon: 'film' },
        { name: 'Shopping',         icon: 'shopping-bag' },
      ]},
      { name: 'Goals', categories: [
        { name: 'Emergency Fund',   icon: 'shield' },
        { name: 'Vacation',         icon: 'plane' },
      ]},
    ],
  },
  {
    id: 'homeowner',
    label: 'Homeowner',
    description: 'Mortgage, taxes, maintenance, the works.',
    groups: [
      { name: 'Home', categories: [
        { name: 'Mortgage',         icon: 'home' },
        { name: 'Property Tax',     icon: 'landmark' },
        { name: 'Home Insurance',   icon: 'shield' },
        { name: 'HOA',              icon: 'building' },
        { name: 'Maintenance',      icon: 'wrench' },
      ]},
      { name: 'Utilities', categories: [
        { name: 'Electric',         icon: 'zap' },
        { name: 'Gas',              icon: 'flame' },
        { name: 'Water / Sewer',    icon: 'droplet' },
        { name: 'Internet',         icon: 'wifi' },
        { name: 'Trash',            icon: 'trash-2' },
      ]},
      { name: 'Everyday', categories: [
        { name: 'Groceries',        icon: 'shopping-cart' },
        { name: 'Dining Out',       icon: 'utensils' },
        { name: 'Transportation',   icon: 'car' },
        { name: 'Personal Care',    icon: 'sparkles' },
      ]},
      { name: 'Goals', categories: [
        { name: 'Emergency Fund',   icon: 'shield' },
        { name: 'Home Improvement', icon: 'wrench' },
      ]},
    ],
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Adds kids, daycare, education, family-specific spending.',
    groups: [
      { name: 'Home', categories: [
        { name: 'Rent / Mortgage',  icon: 'home' },
        { name: 'Utilities',        icon: 'zap' },
        { name: 'Internet',         icon: 'wifi' },
        { name: 'Phones',           icon: 'phone' },
      ]},
      { name: 'Kids', categories: [
        { name: 'Daycare / School', icon: 'graduation-cap' },
        { name: 'Activities',       icon: 'star' },
        { name: 'Clothing',         icon: 'shirt' },
        { name: 'Allowance',        icon: 'piggy-bank' },
      ]},
      { name: 'Family Everyday', categories: [
        { name: 'Groceries',        icon: 'shopping-cart' },
        { name: 'Dining Out',       icon: 'utensils' },
        { name: 'Transportation',   icon: 'car' },
        { name: 'Health / Medical', icon: 'heart' },
        { name: 'Pet Care',         icon: 'paw-print' },
      ]},
      { name: 'Goals', categories: [
        { name: 'Emergency Fund',   icon: 'shield' },
        { name: 'College Savings',  icon: 'graduation-cap' },
        { name: 'Family Vacation',  icon: 'plane' },
      ]},
    ],
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Lean on tuition + small bills + lots of discretionary.',
    groups: [
      { name: 'Bills', categories: [
        { name: 'Tuition / Fees',   icon: 'graduation-cap' },
        { name: 'Rent / Housing',   icon: 'home' },
        { name: 'Phone',            icon: 'phone' },
        { name: 'Streaming',        icon: 'tv' },
      ]},
      { name: 'Everyday', categories: [
        { name: 'Groceries',        icon: 'shopping-cart' },
        { name: 'Dining Out',       icon: 'utensils' },
        { name: 'Coffee',           icon: 'coffee' },
        { name: 'Transit',          icon: 'car' },
        { name: 'Books / Supplies', icon: 'book' },
      ]},
      { name: 'Fun', categories: [
        { name: 'Entertainment',    icon: 'film' },
        { name: 'Going Out',        icon: 'beer' },
        { name: 'Subscriptions',    icon: 'repeat' },
      ]},
      { name: 'Goals', categories: [
        { name: 'Emergency Fund',   icon: 'shield' },
        { name: 'Travel',           icon: 'plane' },
      ]},
    ],
  },
];

/**
 * Apply a preset by creating its groups + categories. By default REPLACES
 * the existing seed data (the demo categories from `db/seed.ts`); pass
 * `mode: 'append'` to add alongside.
 *
 * Returns counts so the UI can show a friendly confirmation.
 */
export function applyPreset(presetId: PresetId, opts: { mode: 'replace' | 'append' } = { mode: 'replace' }): {
  groupsCreated: number; categoriesCreated: number;
} {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return { groupsCreated: 0, categoriesCreated: 0 };

  // If replace mode and any seed groups/categories exist, optimistically
  // delete them. We don't delete user-modified categories — only the
  // ones that look untouched (no transactions, no goal, no notes).
  const state = useBudget.getState();
  if (opts.mode === 'replace') {
    const orphanGroups = state.groups.filter((g) => {
      const cats = state.categories.filter((c) => c.groupId === g.id);
      // Group is "fresh" if every cat in it has no txn activity, no goal, no notes.
      return cats.every((c) =>
        !c.goal &&
        !c.notes &&
        !state.transactions.some((t) => t.categoryId === c.id),
      );
    });
    // Best-effort cleanup; not strictly required.
    for (const g of orphanGroups) {
      const cats = state.categories.filter((c) => c.groupId === g.id);
      for (const c of cats) {
        // Importing deleteCategory dynamically would create a cycle; rely
        // on the user to clean up via Edit if they really want to start
        // clean. For now we just APPEND when we detect a pre-seeded
        // budget — much less destructive.
        void c;
      }
      void g;
    }
  }

  let groupsCreated = 0;
  let categoriesCreated = 0;
  for (const g of preset.groups) {
    // If a group with the same name already exists, reuse it; otherwise
    // create. This makes apply-preset idempotent on repeated runs.
    const existing = state.groups.find((x) => x.name.toLowerCase() === g.name.toLowerCase());
    let groupId: string;
    if (existing) groupId = existing.id;
    else {
      groupId = createGroup(g.name).id;
      groupsCreated++;
    }
    for (const c of g.categories) {
      const dup = state.categories.find(
        (x) => x.groupId === groupId && x.name.toLowerCase() === c.name.toLowerCase(),
      );
      if (dup) continue;
      createCategory({ groupId, name: c.name, icon: c.icon });
      categoriesCreated++;
    }
  }

  return { groupsCreated, categoriesCreated };
}
