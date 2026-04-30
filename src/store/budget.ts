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

  // Subscribe to deep changes per map.
  //
  // The theme apply logic here ONLY runs when the value actually
  // changed since the last observation — local clicks already applied
  // the theme via setTheme() in store/theme.ts, so re-applying on
  // every settings tick was redundant work that compounded under
  // rapid changes (e.g. picking a glass palette color via the picker
  // fires settings updates 60×/sec, each one asynchronously importing
  // glassPalettes and writing to the DOM, which can starve the main
  // thread enough to feel like a freeze).
  //
  // The observer only needs to do work in two cases:
  //   1. Remote sync brought in a new theme/palette — local DOM
  //      doesn't reflect it yet
  //   2. Persisted state on boot doesn't match the current DOM
  //
  // Both are handled by tracking the last-applied values and skipping
  // when they're unchanged.
  let lastAppliedTheme: ThemeName | null = null;
  let lastAppliedGlassPaletteJson: string | null = null;
  doc.getMap(MAPS.settings).observeDeep(() => {
    refreshSettings();
    const settings = useBudget.getState().settings;
    const t = settings.theme as ThemeName;

    if (t !== lastAppliedTheme) {
      lastAppliedTheme = t;
      if (t !== 'auto') {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem('monii:theme', t); } catch {}
      } else {
        try { localStorage.setItem('monii:theme', 'auto'); } catch {}
        // Defer to the resolver in theme.ts, which listens to OS
        // preference + this event.
        window.dispatchEvent(new CustomEvent('monii:theme-change'));
      }
    }

    // Glass palette: apply only when the chosen preset / custom colors
    // actually changed. JSON-serialize for cheap deep-equality.
    const concrete = t === 'auto' ? document.documentElement.getAttribute('data-theme') : t;
    if (concrete === 'glass') {
      const paletteJson = JSON.stringify(settings.glassPalette ?? null);
      if (paletteJson !== lastAppliedGlassPaletteJson) {
        lastAppliedGlassPaletteJson = paletteJson;
        import('../lib/glassPalettes').then((m) => m.applyGlassPalette(settings.glassPalette));
      }
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
