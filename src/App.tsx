import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { BudgetPage } from './pages/BudgetPage';
import { AccountPage } from './pages/AccountPage';
import { AllAccountsPage } from './pages/AllAccountsPage';
import { SearchPage } from './pages/SearchPage';
import { ScheduledPage } from './pages/ScheduledPage';
import { CreditCardsPage } from './pages/CreditCardsPage';
import { GoalsPage } from './pages/GoalsPage';
import { MorePage } from './pages/MorePage';
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
// Maintainer Help — pre-v1 only. Lazy so users who never enable
// maintainer mode don't pay the bundle cost. REMOVE FOR v1.
const MaintainerHelpPage = lazy(() => import('./pages/MaintainerHelpPage').then((m) => ({ default: m.MaintainerHelpPage })));
// Read-only share viewer (Tier 3 #3). Lazy so cold start stays small.
const SharePage = lazy(() => import('./pages/SharePage').then((m) => ({ default: m.SharePage })));
// Receipt gallery (Tier 3 #5).
const ReceiptGalleryPage = lazy(() => import('./pages/ReceiptGalleryPage').then((m) => ({ default: m.ReceiptGalleryPage })));
// Payees management (Tier 7 #3).
const PayeesPage = lazy(() => import('./pages/PayeesPage').then((m) => ({ default: m.PayeesPage })));
// Category drill-down (Tier 7 #4).
const CategoryDetailPage = lazy(() => import('./pages/CategoryDetailPage').then((m) => ({ default: m.CategoryDetailPage })));
// In-app help center (built v0.6.2).
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));

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

  // Show the welcome tour on first run only.
  const onboardingCompleted = useBudget((s) => s.settings.onboardingCompleted);
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
  const celebratedGoals = useBudget((s) => s.settings.celebratedGoals ?? []);
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
              {/* MAINTAINER MODE: REMOVE FOR v1 */}
              <Route path="/help-maint" element={<MaintainerHelpPage />} />
              <Route path="/share" element={<SharePage />} />
              <Route path="/receipts" element={<ReceiptGalleryPage />} />
              <Route path="/payees" element={<PayeesPage />} />
              <Route path="/categories/:categoryId" element={<CategoryDetailPage />} />
              <Route path="/help" element={<HelpPage />} />
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
    </>
  );
}
