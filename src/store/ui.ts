import { create } from 'zustand';

type State = {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  toggleCommand: () => void;

  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  toggleChat: () => void;

  modal: ModalState | null;
  openModal: (m: ModalState) => void;
  closeModal: () => void;

  // selection on transactions table
  selectedTxnIds: Set<string>;
  setSelectedTxnIds: (s: Set<string>) => void;
  toggleTxnSelected: (id: string) => void;
  clearTxnSelection: () => void;

  // Right-side detail pane on regular layout (Tier 4 #1 / Tier 5 #2).
  detailTxnId: string | null;
  setDetailTxnId: (id: string | null) => void;

  // Inline detail expansion in tx table — separate from the desktop
  // detail pane; this is the "click row → expand inline" affordance.
  expandedTxnId: string | null;
  setExpandedTxnId: (id: string | null) => void;

  // Focus mode (Tier 5 #13). Dims everything but the active table.
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;

  // In-app tab bar (Tier 5 #7). Active windows of the app.
  tabs: Array<{ id: string; path: string; label: string }>;
  activeTabId: string | null;
  newTab: (path: string, label: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
};

export type ModalState =
  | { type: 'addAccount' }
  | { type: 'addGroup' }
  | { type: 'addCategory'; groupId: string }
  | { type: 'editCategory'; categoryId: string }
  | { type: 'editGroup'; groupId: string }
  | { type: 'reconcile'; accountId: string }
  | { type: 'editAccount'; accountId: string }
  | { type: 'moveMoney'; fromCategoryId: string; month: string; toCategoryId?: string }
  | { type: 'splitEditor'; transactionId: string }
  | { type: 'importCsv'; accountId: string }
  | { type: 'sync' }
  | { type: 'welcome' }
  | { type: 'scheduledNew' }
  | { type: 'scheduledEdit'; scheduledId: string }
  | { type: 'receiptUpload' }
  | { type: 'debugLogs' }
  | { type: 'addGoal' }
  | { type: 'yearInReview' }
  | { type: 'budgetTemplates' }
  | { type: 'monthlyReview'; month: string }
  | { type: 'bulkPaste'; accountId?: string }
  | { type: 'expectedRefund'; transactionId: string }
  | { type: 'iouEntry'; entryId?: string }
  | { type: 'goalFunding' }
  | { type: 'vacationSummary' }
  | { type: 'shareLink' }
  | { type: 'goalCelebration'; categoryId: string }
  | { type: 'quarterlyReview'; quarter: string }
  | { type: 'onboardingWizard' }
  | { type: 'chatAuditLog' }
  | { type: 'sidebarCustomize' }
  | { type: 'reportsCustomize' }
  | { type: 'savedLayouts' }
  | { type: 'uninstall' }
  | { type: 'billSplit' }
  | { type: 'workspaces' }
  | { type: 'goalPriceUpdate'; categoryId: string }
  | { type: 'whatsNew' }
  | { type: 'auditLog' };

export const useUI = create<State>((set, get) => ({
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
  toggleCommand: () => set({ commandOpen: !get().commandOpen }),

  chatOpen: false,
  setChatOpen: (v) => set({ chatOpen: v }),
  toggleChat: () => set({ chatOpen: !get().chatOpen }),

  modal: null,
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),

  selectedTxnIds: new Set(),
  setSelectedTxnIds: (s) => set({ selectedTxnIds: new Set(s) }),
  toggleTxnSelected: (id) => set((s) => {
    const next = new Set(s.selectedTxnIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { selectedTxnIds: next };
  }),
  clearTxnSelection: () => set({ selectedTxnIds: new Set() }),

  detailTxnId: null,
  setDetailTxnId: (id) => set({ detailTxnId: id }),

  expandedTxnId: null,
  setExpandedTxnId: (id) => set({ expandedTxnId: id }),

  focusMode: false,
  setFocusMode: (v) => set({ focusMode: v }),

  tabs: [],
  activeTabId: null,
  newTab: (path, label) => set((s) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return { tabs: [...s.tabs, { id, path, label }], activeTabId: id };
  }),
  closeTab: (id) => set((s) => {
    const tabs = s.tabs.filter((t) => t.id !== id);
    let activeTabId = s.activeTabId;
    if (activeTabId === id) activeTabId = tabs[tabs.length - 1]?.id ?? null;
    return { tabs, activeTabId };
  }),
  switchTab: (id) => set({ activeTabId: id }),
}));
