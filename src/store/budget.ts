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
  syncSignalingUrl: '',
  googleDriveFileId: '',
  googleDriveLastSyncedAt: 0,
  personalBackupEnabled: false,
  personalBackupUrl: '',
  personalBackupToken: '',
  personalBackupWorkspace: 'default',
  personalBackupLastSyncedAt: 0,
  theme: 'dark',
  todayOverride: '',
  onboardingCompleted: false,
  setupChecklistDismissed: false,
  monthlyIncome: 0,
  payFrequency: 'unset',
  payAnchorDate: '',
  deductions: [],
  layoutPreference: 'auto',
  notificationsEnabled: false,
  notifyBillsDaysAhead: 3,
  notifyOverspending: true,
  notifyGoalDeals: true,
  notifyMonthStart: true,
  yearInReviewShownFor: 0,
  stockPriceApiKey: '',
  glassPalette: { id: 'aurora' },
  accentOverrides: {},
  moneyColorMode: 'default',
  // v0.7.30 — see Settings.dateFormat in domain/types.ts.
  dateFormat: undefined,
  llmStatementParsing: false,
  ocrCorrections: [],
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
  allocationRules: [],
  emergencyFundMonths: 3,
  lastOpenedAt: 0,
  billNegotiationPrompts: [],
  subscriptionUsagePrompts: [],
  overdraftBannerDismissedAt: 0,
  lastSeenVersion: '',
  auditLog: [],
  autoBackupDays: 0,
  lastAutoBackupAt: 0,
  autoBackupHistory: [],
  icloudEnabled: false,
  icloudFolderPath: '',
  icloudLastSyncedAt: 0,
  dealFeedsEnabled: undefined,
  dealFeedsLastPolledAt: 0,
  lastManualExportAt: undefined,
  exportReminderShownAt: undefined,
  appLockEnabled: false,
  appLockTimeoutMinutes: 5,
  knownTags: undefined,
  householdMembers: undefined,
  activeHouseholdMemberId: undefined,
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
  let lastAppliedAccentOverridesJson: string | null = null;
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
    let paletteChanged = false;
    if (concrete === 'glass') {
      const paletteJson = JSON.stringify(settings.glassPalette ?? null);
      if (paletteJson !== lastAppliedGlassPaletteJson) {
        lastAppliedGlassPaletteJson = paletteJson;
        paletteChanged = true;
        import('../lib/glassPalettes').then((m) => m.applyGlassPalette(settings.glassPalette));
      }
    }

    // v0.7.29 — accent must be re-applied whenever the glass PALETTE
    // changes too, not just when accentOverrides does. Switching
    // Aurora → Sunset changes the natural accent (indigo → orange)
    // even with no override; without re-apply, the picker UI showed
    // the new color while `--accent` on body kept the old palette's
    // accent. Now `paletteChanged` short-circuits the
    // accentOverrides-equality check so a palette switch always
    // re-applies. (Theme switches separately re-apply via
    // `reapply()` in store/theme.ts → that path is unchanged.)
    const overridesJson = JSON.stringify(settings.accentOverrides ?? {});
    if (overridesJson !== lastAppliedAccentOverridesJson || paletteChanged) {
      lastAppliedAccentOverridesJson = overridesJson;
      const concreteForAccent = (concrete === 'glass' || concrete === 'light' || concrete === 'dark' || concrete === 'oled')
        ? concrete
        : 'dark';
      import('../lib/accentOverrides').then((m) =>
        m.applyAccentForContext(concreteForAccent, settings.glassPalette, settings.accentOverrides ?? {}));
    }
  });
  // Coalesce refreshes to one per microtask. Yjs fires observeDeep once
  // per TRANSACTION, so a burst of transactions in one tick (a sync
  // catch-up applying many remote updates, a bulk import loop) would
  // otherwise re-materialize + re-sort the full array N times — at
  // 10-20k transactions that's an O(n log n) sort per event. Every
  // in-repo reader consults the Yjs maps directly (never the store),
  // and the store's own getState() consumers all read BEFORE mutating,
  // so a one-microtask delay is unobservable to them; React subscribers
  // re-render on the next tick either way.
  function coalesced(fn: () => void): () => void {
    let scheduled = false;
    return () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; fn(); });
    };
  }
  doc.getMap(MAPS.accounts).observeDeep(coalesced(refreshAccounts));
  doc.getMap(MAPS.groups).observeDeep(coalesced(refreshGroups));
  doc.getMap(MAPS.categories).observeDeep(coalesced(refreshCategories));
  doc.getMap(MAPS.payees).observeDeep(coalesced(refreshPayees));
  doc.getMap(MAPS.txns).observeDeep(coalesced(refreshTransactions));
  doc.getMap(MAPS.assignments).observeDeep(coalesced(refreshAssignments));
  doc.getMap(MAPS.scheduled).observeDeep(coalesced(refreshScheduled));
  doc.getMap(MAPS.trips).observeDeep(coalesced(refreshTrips));
  doc.getMap(MAPS.autoRules).observeDeep(coalesced(refreshAutoRules));
  doc.getMap(MAPS.budgetTemplates).observeDeep(coalesced(refreshBudgetTemplates));
  doc.getMap(MAPS.savedSearches).observeDeep(coalesced(refreshSavedSearches));
  doc.getMap(MAPS.nwSnapshots).observeDeep(coalesced(refreshNwSnapshots));
}
