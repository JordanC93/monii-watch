/**
 * Reactive store. Mirrors the Yjs document into a Zustand store so React
 * components can subscribe to specific slices and re-render efficiently.
 *
 * On every Yjs deep change we re-snapshot the affected map. This is fine for
 * the data sizes we expect (hundreds-thousands of transactions).
 */

import { create } from 'zustand';
import { getDoc, MAPS } from '../sync/doc';
import type {
  Account, AutoRule, BudgetTemplate, CategoryGroup, Category, MonthAssignment, NwSnapshot, Payee,
  SavedSearch, ScheduledTransaction, Settings, Transaction, ThemeName, TripBudget,
} from '../domain/types';
import { thisMonthIso } from '../domain/date';

type State = {
  settings: Settings;
  accounts: Account[];
  groups: CategoryGroup[];
  categories: Category[];
  payees: Payee[];
  transactions: Transaction[];
  assignments: MonthAssignment[];
  scheduled: ScheduledTransaction[];
  trips: TripBudget[];
  autoRules: AutoRule[];
  budgetTemplates: BudgetTemplate[];
  savedSearches: SavedSearch[];
  nwSnapshots: NwSnapshot[];
  /** Selected month on the budget page */
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
};

const initialSettings: Settings = {
  budgetName: 'My Budget',
  currency: 'USD',
  syncRoom: '',
  syncEnabled: false,
  syncServerUrl: '',
  googleDriveEnabled: false,
  googleClientId: '',
  googleAccessToken: '',
  googleAccessTokenExpiresAt: 0,
  googleDriveFileId: '',
  googleDriveLastSyncedAt: 0,
  theme: 'dark',
  todayOverride: '',
  onboardingCompleted: false,
  setupChecklistDismissed: false,
  monthlyIncome: 0,
  payFrequency: 'unset',
  payAnchorDate: '',
  deductions: [],
  maintainerMode: false,
  layoutPreference: 'auto',
  notificationsEnabled: false,
  notifyBillsDaysAhead: 3,
  notifyOverspending: true,
  notifyGoalDeals: true,
  notifyMonthStart: true,
  yearInReviewShownFor: 0,
  stockPriceApiKey: '',
  glassPalette: { id: 'aurora' },
  moneyColorMode: 'default',
  monthlyReviews: [],
  monthlyReviewLastShown: '',
  savedPhrases: [],
  iouLedger: [],
  netWorthAfterTaxRate: 0.22,
  useNwSnapshots: true,
  celebratedGoals: [],
  quarterlyReviewLastShown: '',
  quarterlyReviews: [],
  onboardingWizardCompleted: false,
  chatAuditLog: [],
  sidebarOrder: [],
  reportsOrder: [],
  savedLayouts: [],
  fxSnapshots: [],
};

export const useBudget = create<State>((set) => ({
  settings: initialSettings,
  accounts: [],
  groups: [],
  categories: [],
  payees: [],
  transactions: [],
  assignments: [],
  scheduled: [],
  trips: [],
  autoRules: [],
  budgetTemplates: [],
  savedSearches: [],
  nwSnapshots: [],
  selectedMonth: thisMonthIso(),
  setSelectedMonth: (m) => set({ selectedMonth: m }),
}));

let _wired = false;

export function wireStoreToYjs() {
  if (_wired) return;
  _wired = true;
  const doc = getDoc();

  function refreshSettings() {
    const m = doc.getMap<any>(MAPS.settings);
    const settings = { ...initialSettings, ...Object.fromEntries(Array.from(m.entries())) } as Settings;
    useBudget.setState({ settings });
  }
  function refreshAccounts() {
    const m = doc.getMap<Account>(MAPS.accounts);
    useBudget.setState({ accounts: Array.from(m.values()).sort((a, b) => a.order - b.order) });
  }
  function refreshGroups() {
    const m = doc.getMap<CategoryGroup>(MAPS.groups);
    useBudget.setState({ groups: Array.from(m.values()).sort((a, b) => a.order - b.order) });
  }
  function refreshCategories() {
    const m = doc.getMap<Category>(MAPS.categories);
    useBudget.setState({ categories: Array.from(m.values()).sort((a, b) => a.order - b.order) });
  }
  function refreshPayees() {
    const m = doc.getMap<Payee>(MAPS.payees);
    useBudget.setState({ payees: Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  function refreshTransactions() {
    const m = doc.getMap<Transaction>(MAPS.txns);
    useBudget.setState({
      transactions: Array.from(m.values()).sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.createdAt - a.createdAt;
      }),
    });
  }
  function refreshAssignments() {
    const m = doc.getMap<MonthAssignment>(MAPS.assignments);
    useBudget.setState({ assignments: Array.from(m.values()) });
  }
  function refreshScheduled() {
    const m = doc.getMap<ScheduledTransaction>(MAPS.scheduled);
    useBudget.setState({
      scheduled: Array.from(m.values()).sort((a, b) => {
        if (a.paused !== b.paused) return a.paused ? 1 : -1;
        if (a.nextDate !== b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
        return a.createdAt - b.createdAt;
      }),
    });
  }
  function refreshTrips() {
    const m = doc.getMap<TripBudget>(MAPS.trips);
    useBudget.setState({ trips: Array.from(m.values()).sort((a, b) => b.createdAt - a.createdAt) });
  }
  function refreshAutoRules() {
    const m = doc.getMap<AutoRule>(MAPS.autoRules);
    useBudget.setState({ autoRules: Array.from(m.values()).sort((a, b) => a.order - b.order) });
  }
  function refreshBudgetTemplates() {
    const m = doc.getMap<BudgetTemplate>(MAPS.budgetTemplates);
    useBudget.setState({ budgetTemplates: Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  function refreshSavedSearches() {
    const m = doc.getMap<SavedSearch>(MAPS.savedSearches);
    useBudget.setState({ savedSearches: Array.from(m.values()).sort((a, b) => a.order - b.order) });
  }
  function refreshNwSnapshots() {
    const m = doc.getMap<NwSnapshot>(MAPS.nwSnapshots);
    useBudget.setState({ nwSnapshots: Array.from(m.values()).sort((a, b) => (a.date < b.date ? -1 : 1)) });
  }

  // Initial snapshots
  refreshSettings();
  refreshAccounts();
  refreshGroups();
  refreshCategories();
  refreshPayees();
  refreshTransactions();
  refreshAssignments();
  refreshScheduled();
  refreshTrips();
  refreshAutoRules();
  refreshBudgetTemplates();
  refreshSavedSearches();
  refreshNwSnapshots();

  // Subscribe to deep changes per map
  doc.getMap(MAPS.settings).observeDeep(() => {
    refreshSettings();
    // Apply theme on change. The Auto theme is resolved at apply-time
    // so the data-theme attribute is always one of the four concrete
    // themes — see src/store/theme.ts.
    const t = useBudget.getState().settings.theme as ThemeName;
    // Glass palette is applied on every settings change so picking a
    // new preset / custom colors updates the gradient live without
    // needing a page reload.
    const concrete = (t === 'auto' ? null : t) ?? document.documentElement.getAttribute('data-theme');
    if (concrete === 'glass') {
      // Lazy import to avoid a circular dep (glassPalettes uses no other
      // app modules; theme.ts → budget.ts would be the cycle).
      import('../lib/glassPalettes').then((m) => m.applyGlassPalette(useBudget.getState().settings.glassPalette));
    }
    if (t !== 'auto') {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('monii:theme', t); } catch {}
    } else {
      // Auto theme: defer to the resolver in theme.ts which listens to the
      // OS preference. Just mark the stored preference so reload picks
      // it up.
      try { localStorage.setItem('monii:theme', 'auto'); } catch {}
      // Trigger a re-resolve by dispatching a change event the resolver
      // already subscribes to.
      window.dispatchEvent(new CustomEvent('monii:theme-change'));
    }
  });
  doc.getMap(MAPS.accounts).observeDeep(refreshAccounts);
  doc.getMap(MAPS.groups).observeDeep(refreshGroups);
  doc.getMap(MAPS.categories).observeDeep(refreshCategories);
  doc.getMap(MAPS.payees).observeDeep(refreshPayees);
  doc.getMap(MAPS.txns).observeDeep(refreshTransactions);
  doc.getMap(MAPS.assignments).observeDeep(refreshAssignments);
  doc.getMap(MAPS.scheduled).observeDeep(refreshScheduled);
  doc.getMap(MAPS.trips).observeDeep(refreshTrips);
  doc.getMap(MAPS.autoRules).observeDeep(refreshAutoRules);
  doc.getMap(MAPS.budgetTemplates).observeDeep(refreshBudgetTemplates);
  doc.getMap(MAPS.savedSearches).observeDeep(refreshSavedSearches);
  doc.getMap(MAPS.nwSnapshots).observeDeep(refreshNwSnapshots);
}
