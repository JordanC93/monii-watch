import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
// BudgetPage stays eager — it's the landing route on cold start, so
// lazy-loading it would just show a loading spinner that flashes for
// no reason. Everything else is one navigation away and can wait.
import { BudgetPage } from './pages/BudgetPage';
// v0.7.30 #9 — pages converted from eager to lazy. Each one was
// adding ~30-80 KB to the main bundle for users who never navigate
// to them on cold start. Suspense fallback inherits the existing
// `<Suspense fallback={…}>` wrapper down in the routes block.
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const AllAccountsPage = lazy(() => import('./pages/AllAccountsPage').then((m) => ({ default: m.AllAccountsPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const ScheduledPage = lazy(() => import('./pages/ScheduledPage').then((m) => ({ default: m.ScheduledPage })));
const CreditCardsPage = lazy(() => import('./pages/CreditCardsPage').then((m) => ({ default: m.CreditCardsPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const MorePage = lazy(() => import('./pages/MorePage').then((m) => ({ default: m.MorePage })));
import { useGlobalShortcuts } from './lib/shortcuts';
import { CommandPalette } from './components/Modals/CommandPalette';
import { KeyboardHintsOverlay } from './components/Modals/KeyboardHintsOverlay';
import { ChatPanel } from './components/Chat/ChatPanel';
import { Toaster } from './components/ui/Toaster';
import { useBudget } from './store/budget';
import { useUI } from './store/ui';
import { YearInReviewModal } from './components/Modals/YearInReviewModal';
import { useState, useRef } from 'react';
import { computeGoalProgress } from './domain/goals';
import { computeMonthBudgetCached } from './domain/budgetCache';
import { setSettingsField, exportSnapshot } from './db/repo';
import { computeAccountBalances, computeNetWorth } from './domain/budget';
import { getActiveWorkspaceId, writeWorkspaceSummary } from './lib/workspaces';
import { hasLocalPin, markBackgroundedNow, shouldRelock, clearBackgroundMark } from './lib/appLock';
import { AppLockScreen } from './components/Layout/AppLockScreen';
import { subscribeMenuEvents, printPage, openNewDesktopWindow } from './lib/nativeDesktop';
import { useNavigate } from 'react-router-dom';
import { undo, redo } from './store/undo';
import { togglePrivacy } from './lib/privacy';

// Reports pulls in Recharts (~280KB). Settings pulls a chunk of unrelated UI.
// Both are lazy so the budget/account hot-path stays small.
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
// Secondary pages — lazy so they don't bloat the cold start.
const TripsPage = lazy(() => import('./pages/TripsPage').then((m) => ({ default: m.TripsPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage').then((m) => ({ default: m.InvestmentsPage })));
const AutoRulesPage = lazy(() => import('./pages/AutoRulesPage').then((m) => ({ default: m.AutoRulesPage })));
// Read-only share viewer (Tier 3 #3). Lazy so cold start stays small.
const SharePage = lazy(() => import('./pages/SharePage').then((m) => ({ default: m.SharePage })));
// Receipt gallery (Tier 3 #5).
const ReceiptGalleryPage = lazy(() => import('./pages/ReceiptGalleryPage').then((m) => ({ default: m.ReceiptGalleryPage })));
// Payees management (Tier 7 #3).
const PayeesPage = lazy(() => import('./pages/PayeesPage').then((m) => ({ default: m.PayeesPage })));
// Per-payee drill-down (v0.7.28). Lazy because recharts is heavy.
const PayeeDetailPage = lazy(() => import('./pages/PayeeDetailPage').then((m) => ({ default: m.PayeeDetailPage })));
// Recurring expense audit (v0.7.29). Reuses subscription detector.
const SubscriptionsAuditPage = lazy(() => import('./pages/SubscriptionsAuditPage').then((m) => ({ default: m.SubscriptionsAuditPage })));
// Review queue (v0.7.29).
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage').then((m) => ({ default: m.ReviewQueuePage })));
// Annual budget grid (v0.7.29) — categories × 12 months heatmap.
const AnnualBudgetPage = lazy(() => import('./pages/AnnualBudgetPage').then((m) => ({ default: m.AnnualBudgetPage })));
// Category drill-down (Tier 7 #4).
const CategoryDetailPage = lazy(() => import('./pages/CategoryDetailPage').then((m) => ({ default: m.CategoryDetailPage })));
// In-app help center (built v0.6.2).
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));
// Custom dashboard (Tier 8 #13).
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
// FIRE planner (Tier 9 #3).
const FirePage = lazy(() => import('./pages/FirePage').then((m) => ({ default: m.FirePage })));
// Calendar grid view (Tier 9 #8) — full month grid; the existing
// /calendar is the heatmap, this adds a day-by-day view.
const CalendarGridPage = lazy(() => import('./pages/CalendarGridPage').then((m) => ({ default: m.CalendarGridPage })));
// Trash page (Tier 11 #1) — soft-deleted entries with restore /
// permanent purge / 30-day auto-purge.
const TrashPage = lazy(() => import('./pages/TrashPage').then((m) => ({ default: m.TrashPage })));
// Disaster recovery flow (Tier 11 #4).
const RecoverPage = lazy(() => import('./pages/RecoverPage').then((m) => ({ default: m.RecoverPage })));
// Privacy + data-deletion explainer (Tier 13 #2 / App Store).
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));

// Stable fallback for optional settings arrays. Never inline `?? []`
// inside a Zustand selector (Iron Rule #21) — the fresh array reference
// each render can trigger useSyncExternalStore re-render loops.
const EMPTY_CELEBRATED_GOALS: string[] = [];

function PageFallback() {
  return (
    <div className="p-8 text-fg-subtle text-[12.5px] flex items-center gap-2">
      <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      Loading…
    </div>
  );
}

export default function App() {
  useGlobalShortcuts();
  const nav = useNavigate();
  const location = useLocation();

  // Tier 5 #1 — wire native menubar clicks to app actions.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void subscribeMenuEvents((id) => {
      switch (id) {
        case 'file.new_txn':
          // Open the chat panel with the cursor focused — fastest path
          // to add a transaction without leaving the active page.
          window.dispatchEvent(new CustomEvent('monii:open-chat'));
          break;
        case 'file.new_account':
          window.dispatchEvent(new CustomEvent('monii:open-modal', { detail: { type: 'addAccount' } }));
          break;
        case 'file.import_csv':
          window.dispatchEvent(new CustomEvent('monii:open-modal', { detail: { type: 'bulkPaste' } }));
          break;
        case 'file.export_json': {
          const snap = exportSnapshot();
          const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `monii-watch-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
        case 'file.export_encrypted':
          nav('/settings');
          break;
        case 'file.print': void printPage(); break;
        case 'edit.undo': undo(); break;
        case 'edit.redo': redo(); break;
        case 'edit.find': {
          const el = document.querySelector<HTMLInputElement>('[data-search-input]');
          if (el) el.focus(); else nav('/search');
          break;
        }
        case 'edit.command_palette':
          window.dispatchEvent(new CustomEvent('monii:open-palette'));
          break;
        case 'view.budget':    nav('/budget'); break;
        case 'view.accounts':  nav('/accounts'); break;
        case 'view.reports':   nav('/reports'); break;
        case 'view.scheduled': nav('/scheduled'); break;
        case 'view.search':    nav('/search'); break;
        case 'view.toggle_sidebar':
          document.documentElement.classList.toggle('sidebar-collapsed');
          break;
        case 'view.zen_mode':
          document.documentElement.classList.toggle('zen-mode');
          break;
        case 'view.focus_mode':
          document.documentElement.classList.toggle('focus-mode');
          break;
        case 'view.privacy_mode': togglePrivacy(); break;
        case 'view.density': {
          const cur = document.documentElement.getAttribute('data-density') ?? 'comfortable';
          const next = cur === 'comfortable' ? 'compact' : cur === 'compact' ? 'spacious' : 'comfortable';
          void import('./lib/density').then((m) => m.setDensity(next as any));
          break;
        }
        case 'window.new_window':
          void openNewDesktopWindow(window.location.pathname);
          break;
        case 'window.new_tab':
          window.dispatchEvent(new CustomEvent('monii:new-tab'));
          break;
        case 'window.next_monitor':
          void import('./lib/nativeDesktop').then(async (m) => {
            const monitors = await m.listMonitors();
            if (monitors.length < 2) return;
            // Cycle to the next monitor relative to the current one. The
            // native side picks based on index; we just compute it here.
            await m.moveToMonitor(1 % monitors.length);
          });
          break;
        case 'help.welcome':
          window.dispatchEvent(new CustomEvent('monii:open-modal', { detail: { type: 'welcome' } }));
          break;
        case 'help.audit':
          window.dispatchEvent(new CustomEvent('monii:open-modal', { detail: { type: 'chatAuditLog' } }));
          break;
        case 'help.logs':
          window.dispatchEvent(new CustomEvent('monii:open-modal', { detail: { type: 'debugLogs' } }));
          break;
      }
    }).then((u) => { unlisten = u; });
    return () => { unlisten?.(); };
  }, [nav]);

  // Bridge the menubar's `monii:open-modal` events into useUI so menu
  // items can open modals without holding a direct ref to the store.
  useEffect(() => {
    function onOpenModal(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail) useUI.getState().openModal(detail);
    }
    function onOpenChat() { useUI.getState().setChatOpen(true); }
    function onOpenPalette() { useUI.getState().setCommandOpen(true); }
    window.addEventListener('monii:open-modal', onOpenModal);
    window.addEventListener('monii:open-chat', onOpenChat);
    window.addEventListener('monii:open-palette', onOpenPalette);
    return () => {
      window.removeEventListener('monii:open-modal', onOpenModal);
      window.removeEventListener('monii:open-chat', onOpenChat);
      window.removeEventListener('monii:open-palette', onOpenPalette);
    };
  }, []);

  // Right-click on internal links: replace the WKWebView / WebView2
  // default context menu with our own, so "Open in New Window" actually
  // opens a Tauri WebviewWindow with shared localStorage (same theme,
  // same data) instead of routing the request to the OS default
  // browser, which has fresh storage and looks like a theme reset.
  // Cmd / Ctrl / middle-click on links also routes through the new
  // window helper so keyboard shortcuts behave the same way.
  useEffect(() => {
    function findInternalLink(target: EventTarget | null): HTMLAnchorElement | null {
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        if (el.tagName === 'A') {
          const href = (el as HTMLAnchorElement).getAttribute('href') ?? '';
          // Only intercept same-origin internal routes. External URLs and
          // mailto / tel / blob links should keep their default behavior.
          if (href.startsWith('/') && !href.startsWith('//')) {
            return el as HTMLAnchorElement;
          }
          return null;
        }
        el = el.parentElement;
      }
      return null;
    }

    async function openLinkInNewWindow(href: string) {
      try {
        const m = await import('./lib/nativeDesktop');
        await m.openNewDesktopWindow(href);
      } catch {
        // PWA / browser fallback: open in a new tab.
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    }

    function onContext(e: MouseEvent) {
      const link = findInternalLink(e.target);
      if (!link) return;
      const href = link.getAttribute('href') ?? '';
      if (!href) return;
      e.preventDefault();
      (async () => {
        try {
          const m = await import('./lib/nativeDesktop');
          const id = await m.showNativeContextMenu([
            { id: 'open', label: 'Open' },
            { id: 'open-new-window', label: 'Open in New Window' },
            { id: 'copy-link', label: 'Copy Link', separatorBefore: true },
          ]);
          if (id === 'open') {
            nav(href);
          } else if (id === 'open-new-window') {
            await openLinkInNewWindow(href);
          } else if (id === 'copy-link') {
            try { await navigator.clipboard.writeText(href); } catch {}
          }
        } catch {
          // No native menu (browser PWA): just navigate as a normal click.
          nav(href);
        }
      })();
    }

    function onAuxOrModified(e: MouseEvent) {
      // Cmd+Click (Mac), Ctrl+Click (Win/Linux), middle-click → new window.
      const isNewWindowIntent =
        e.button === 1 || // middle-click
        (e.button === 0 && (e.metaKey || e.ctrlKey));
      if (!isNewWindowIntent) return;
      const link = findInternalLink(e.target);
      if (!link) return;
      const href = link.getAttribute('href') ?? '';
      if (!href) return;
      e.preventDefault();
      void openLinkInNewWindow(href);
    }

    document.addEventListener('contextmenu', onContext);
    document.addEventListener('click', onAuxOrModified);
    document.addEventListener('auxclick', onAuxOrModified);
    return () => {
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('click', onAuxOrModified);
      document.removeEventListener('auxclick', onAuxOrModified);
    };
  }, [nav]);

  // Show the welcome tour on first run only.
  const onboardingCompleted = useBudget((s) => s.settings.onboardingCompleted);
  const lastSeenVersion = useBudget((s) => s.settings.lastSeenVersion);

  // App-lock state (Tier 13 #5). Locked on cold boot when enabled +
  // a local PIN exists. Unlocking via the lock screen flips this to
  // false; backgrounding past the timeout flips it back to true.
  const appLockEnabled = useBudget((s) => s.settings.appLockEnabled);
  const appLockTimeoutMinutes = useBudget((s) => s.settings.appLockTimeoutMinutes);
  const [locked, setLocked] = useState<boolean>(() => appLockEnabled && hasLocalPin());

  // Listen for visibility changes to mark "backgrounded at" / re-lock
  // when the app comes back to foreground after the timeout.
  useEffect(() => {
    if (!appLockEnabled || !hasLocalPin()) return;
    function onVis() {
      if (document.visibilityState === 'hidden') {
        markBackgroundedNow();
      } else {
        if (shouldRelock(appLockTimeoutMinutes)) {
          setLocked(true);
        }
        clearBackgroundMark();
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [appLockEnabled, appLockTimeoutMinutes]);

  // When the user just turns the lock on, leave them unlocked for
  // this session — only re-lock on next cold boot.
  useEffect(() => {
    if (!appLockEnabled) setLocked(false);
  }, [appLockEnabled]);

  // Tier 10 #6 — write the active workspace's summary on every NW
  // change so the cross-workspace widget on OTHER workspaces sees
  // up-to-date numbers. Lifted from Sidebar (which isn't rendered on
  // mobile) to App so the write happens on every layout. Cheap;
  // localStorage write only when the value changes.
  const accountsForNw = useBudget((s) => s.accounts);
  const txnsForNw = useBudget((s) => s.transactions);
  const currencyForNw = useBudget((s) => s.settings.currency);
  useEffect(() => {
    try {
      const balances = computeAccountBalances(accountsForNw.filter((a) => !a.closed), txnsForNw);
      const nw = computeNetWorth(balances);
      const wsId = getActiveWorkspaceId();
      writeWorkspaceSummary(wsId, {
        netWorth: nw.total,
        currency: currencyForNw || 'USD',
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[workspace-summary] write failed', err);
    }
  }, [accountsForNw, txnsForNw, currencyForNw]);
  const yearInReviewShownFor = useBudget((s) => s.settings.yearInReviewShownFor);
  const monthlyReviewLastShown = useBudget((s) => s.settings.monthlyReviewLastShown);
  const vacationMode = useBudget((s) => s.settings.vacationMode);
  const onboardingWizardCompleted = useBudget((s) => s.settings.onboardingWizardCompleted);
  const quarterlyReviewLastShown = useBudget((s) => s.settings.quarterlyReviewLastShown);
  const openModal = useUI((s) => s.openModal);
  const currentModal = useUI((s) => s.modal);

  // Onboarding wizard auto-open: after the welcome tour finishes AND the
  // user hasn't seen the wizard yet. Stamps `onboardingWizardCompleted`
  // when they finish or skip.
  useEffect(() => {
    if (!onboardingCompleted) return;
    if (onboardingWizardCompleted) return;
    if (currentModal !== null) return;
    openModal({ type: 'onboardingWizard' });
  }, [onboardingCompleted, onboardingWizardCompleted, currentModal, openModal]);

  // Goal completion celebration. When any underfunded goal newly hits
  // `funded` status this month, queue up the celebration modal. Each
  // (categoryId × month) fires at most once via `Settings.celebratedGoals`.
  const accounts = useBudget((s) => s.accounts);
  const categories = useBudget((s) => s.categories);
  const txnsForGoal = useBudget((s) => s.transactions);
  const assignmentsForGoal = useBudget((s) => s.assignments);
  const month = useBudget((s) => s.selectedMonth);
  const celebratedGoalsRaw = useBudget((s) => s.settings.celebratedGoals);
  const celebratedGoals = celebratedGoalsRaw ?? EMPTY_CELEBRATED_GOALS;
  useEffect(() => {
    if (!onboardingCompleted || currentModal !== null) return;
    const monthBudget = computeMonthBudgetCached(accounts, categories, txnsForGoal, assignmentsForGoal, month);
    for (const c of categories) {
      if (!c.goal || c.hidden) continue;
      const mb = monthBudget.get(c.id);
      if (!mb) continue;
      const prog = computeGoalProgress(c, month, mb.assigned, mb.available);
      if (prog.status !== 'funded' && prog.status !== 'overfunded') continue;
      const key = `${c.id}|${month}`;
      if (celebratedGoals.includes(key)) continue;
      // Fire celebration + stamp.
      const next = [...celebratedGoals, key];
      while (next.length > 200) next.shift();
      setSettingsField('celebratedGoals', next);
      openModal({ type: 'goalCelebration', categoryId: c.id });
      break; // only one at a time; next render picks up the rest
    }
  }, [accounts, categories, txnsForGoal, assignmentsForGoal, month, celebratedGoals, currentModal, onboardingCompleted, openModal]);

  // Quarterly review auto-open: in the first 7 days of a new quarter
  // AND we haven't shown it for the just-ended quarter yet.
  useEffect(() => {
    if (!onboardingCompleted || currentModal !== null) return;
    const now = new Date();
    const day = now.getDate();
    if (day > 7) return; // only in the first week of a new quarter
    const monthIdx = now.getMonth(); // 0-11
    if (monthIdx % 3 !== 0) return; // only Jan / Apr / Jul / Oct
    const Q = Math.floor(monthIdx / 3); // 0-3 → just-ended quarter is Q-1 of same year, OR Q4 of prev year if Q=0
    const justEndedQuarter = Q === 0 ? `${now.getFullYear() - 1}-Q4` : `${now.getFullYear()}-Q${Q}`;
    if (quarterlyReviewLastShown >= justEndedQuarter) return;
    openModal({ type: 'quarterlyReview', quarter: justEndedQuarter });
  }, [onboardingCompleted, quarterlyReviewLastShown, currentModal, openModal]);

  // Vacation summary auto-open: when today is past the vacation end date AND
  // we haven't already shown the summary for that vacation. Stamps
  // `vacationMode.summaryShownFor` so it doesn't re-fire.
  useEffect(() => {
    if (!onboardingCompleted || currentModal !== null) return;
    if (!vacationMode || !vacationMode.endDate) return;
    const today = new Date().toISOString().slice(0, 10);
    if (today <= vacationMode.endDate) return;
    if (vacationMode.summaryShownFor === vacationMode.endDate) return;
    openModal({ type: 'vacationSummary' });
  }, [vacationMode, currentModal, onboardingCompleted, openModal]);
  useEffect(() => {
    if (!onboardingCompleted && currentModal === null) {
      openModal({ type: 'welcome' });
    }
  }, [onboardingCompleted, openModal, currentModal]);

  // What's new (Tier 10 #1) — auto-fire after onboarding finishes
  // when the build version has advanced past `lastSeenVersion`.
  //
  // Three cases:
  //   1. New user, onboardingCompleted=false: welcome tour wins.
  //      We stamp the version when the welcome flow finishes (handled
  //      separately) so the modal stays quiet on subsequent boots.
  //   2. Existing user upgrading from a pre-v0.6.7 install:
  //      `lastSeenVersion` is empty (the field didn't exist). Treat
  //      as "upgrade" — show the modal. This matches user expectation:
  //      they DID upgrade, just from a build that didn't track it.
  //   3. Existing user, version matches: no-op.
  useEffect(() => {
    if (!onboardingCompleted || currentModal !== null) return;
    if (lastSeenVersion === __APP_VERSION__) return;
    void import('./components/Modals/WhatsNewModal').then((m) => {
      if (m.pickReleaseEntry(__APP_VERSION__) !== null) {
        openModal({ type: 'whatsNew' });
      } else {
        // No notes for this build — silently advance the marker.
        setSettingsField('lastSeenVersion', __APP_VERSION__);
      }
    });
  }, [onboardingCompleted, lastSeenVersion, currentModal, openModal]);

  // Year-in-review auto-open. Trigger conditions:
  //   - It's after Jan 5 of the current year (give the user a few days
  //     to settle into Jan; arbitrary cutoff)
  //   - We haven't shown the previous year's review yet
  //   - No other modal is open (don't fight onboarding etc.)
  const [yearReviewYear, setYearReviewYear] = useState<number | null>(null);
  useEffect(() => {
    const now = new Date();
    const lastYear = now.getFullYear() - 1;
    const isAfterJan5 = now.getMonth() === 0 && now.getDate() >= 5;
    const isLaterInYear = now.getMonth() > 0;
    if ((isAfterJan5 || isLaterInYear) && yearInReviewShownFor < lastYear && currentModal === null && onboardingCompleted) {
      setYearReviewYear(lastYear);
    }
  }, [yearInReviewShownFor, currentModal, onboardingCompleted]);

  // Monthly review prompt — first time the user opens the app in a new
  // month, surface the previous month's review modal. Records show OR
  // skip on close so we don't keep nagging within the same month.
  //
  // Session guard: `monthlyReviewShownThisSession` ref prevents the
  // effect from re-firing the timeout if observer-driven state changes
  // re-run the effect within the same browser session. Without it,
  // each settings update could pile up another deferred openModal.
  const monthlyReviewShownThisSession = useRef(false);
  useEffect(() => {
    if (!onboardingCompleted || currentModal !== null) return;
    if (monthlyReviewShownThisSession.current) return;
    const now = new Date();
    const prevMonth = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    if (monthlyReviewLastShown >= prevMonth) return;
    monthlyReviewShownThisSession.current = true;
    // Defer so the welcome tour and year-in-review can win the race
    // when both qualify (rare but possible on a fresh-install Jan 1).
    const t = setTimeout(() => {
      openModal({ type: 'monthlyReview', month: prevMonth });
    }, 1200);
    return () => clearTimeout(t);
  }, [monthlyReviewLastShown, currentModal, onboardingCompleted, openModal]);

  return (
    <>
      <Layout>
        <ErrorBoundary variant="route" resetKey={location.pathname} scope="page">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/budget" replace />} />
              <Route path="/budget" element={<BudgetPage />} />
              <Route path="/accounts" element={<AllAccountsPage />} />
              <Route path="/accounts/:accountId" element={<AccountPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/scheduled" element={<ScheduledPage />} />
              <Route path="/credit-cards" element={<CreditCardsPage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/trips" element={<TripsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/investments" element={<InvestmentsPage />} />
              <Route path="/auto-rules" element={<AutoRulesPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/more" element={<MorePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/share" element={<SharePage />} />
              <Route path="/receipts" element={<ReceiptGalleryPage />} />
              <Route path="/payees" element={<PayeesPage />} />
              <Route path="/payees/:payeeId" element={<PayeeDetailPage />} />
              <Route path="/subscriptions" element={<SubscriptionsAuditPage />} />
              <Route path="/review" element={<ReviewQueuePage />} />
              <Route path="/budget/annual" element={<AnnualBudgetPage />} />
              <Route path="/categories/:categoryId" element={<CategoryDetailPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/fire" element={<FirePage />} />
              <Route path="/calendar/grid" element={<CalendarGridPage />} />
              <Route path="/trash" element={<TrashPage />} />
              <Route path="/recover" element={<RecoverPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<Navigate to="/budget" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
      <CommandPalette />
      <KeyboardHintsOverlay />
      <ChatPanel />
      <Toaster />
      {yearReviewYear !== null && (
        <YearInReviewModal
          open
          year={yearReviewYear}
          onClose={() => setYearReviewYear(null)}
        />
      )}
      {/* App lock screen renders OVER everything else when locked.
          It's the last child so it stacks above all modals. */}
      {locked && <AppLockScreen onUnlock={() => setLocked(false)} />}
    </>
  );
}
