import { ReadyToAssign } from '../components/Budget/ReadyToAssign';
import { BudgetTable } from '../components/Budget/BudgetTable';
import { QuickStats } from '../components/Budget/QuickStats';
import { OverspendingAlert } from '../components/Budget/OverspendingAlert';
import { SetupChecklist } from '../components/Budget/SetupChecklist';
import { GoalDealBanner } from '../components/Budget/GoalDealBanner';
import { DealMatchesBanner } from '../components/Budget/DealMatchesBanner';
import { ExportReminderBanner } from '../components/Budget/ExportReminderBanner';
import { SeasonalHint } from '../components/Budget/SeasonalHint';
import { SafeToSpendBanner } from '../components/Budget/SafeToSpendBanner';
import { CreditUtilizationAlert } from '../components/Budget/CreditUtilizationAlert';
import { OverdraftBanner } from '../components/Budget/OverdraftBanner';
import { LastSessionBanner } from '../components/Budget/LastSessionBanner';
import { SubscriptionUsagePrompt } from '../components/Budget/SubscriptionUsagePrompt';
import { AnomalyAlert } from '../components/Budget/AnomalyAlert';
import { HardLimitsBanner } from '../components/Budget/HardLimitsBanner';
import { MobileMonthSwitcher } from '../components/Budget/MobileMonthSwitcher';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { useBudget } from '../store/budget';
import { shiftMonth } from '../domain/date';
import { useSwipe } from '../lib/swipe';

export function BudgetPage() {
  const month = useBudget((s) => s.selectedMonth);
  const setMonth = useBudget((s) => s.setSelectedMonth);
  const budgetName = useBudget((s) => s.settings.budgetName);

  // Mobile gesture: swipe left = next month, swipe right = previous month.
  // Matches the iOS calendar app convention.
  const swipe = useSwipe(
    () => setMonth(shiftMonth(month, +1)),
    () => setMonth(shiftMonth(month, -1)),
  );

  return (
    <div {...swipe} className="max-w-6xl mx-auto">
      {/* iOS large-title header — compact layout only. Includes the month
          switcher inline as an "accessory" so the picker is always one
          tap away above the budget table. */}
      <MobilePageHeader
        title="Budget"
        subtitle={budgetName}
        accessory={<MobileMonthSwitcher />}
      />

      {/* Page body. Padding stays inside so the large header above can
          go edge-to-edge if it wants to. */}
      <div className="p-3 sm:p-5 space-y-4">
        <SetupChecklist />
        <ExportReminderBanner />
        <LastSessionBanner />
        <ReadyToAssign />
        <SafeToSpendBanner />
        <SeasonalHint />
        <CreditUtilizationAlert />
        <OverdraftBanner />
        <AnomalyAlert />
        <HardLimitsBanner />
        <SubscriptionUsagePrompt />
        <GoalDealBanner />
        <DealMatchesBanner />
        <OverspendingAlert />
        <QuickStats />
        <BudgetTable />
      </div>
    </div>
  );
}
