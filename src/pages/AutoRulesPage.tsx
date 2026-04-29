/**
 * Auto-rules management page.
 *
 * Two flavors of rules:
 *
 *   - Category rules (default): substring pattern → applied category.
 *     Fires on every new transaction whose payee matches.
 *   - Transfer rules: pattern + source/destination accounts → the
 *     matched txn is converted into a paired transfer between accounts
 *     instead of being categorized. Useful for "every Capital One →
 *     Chase payment is a transfer, never a transaction".
 *
 * Bulk apply (category rules only) runs against historical transactions.
 */

import { useState } from 'react';
import { Plus, Trash2, Wand2, ArrowLeft, ArrowLeftRight, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '../store/budget';
import {
  createAutoRule, updateAutoRule, deleteAutoRule, applyAutoRuleToHistory,
} from '../db/repo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { MobilePageHeader } from '../components/Layout/MobilePageHeader';
import { toast } from '../lib/toast';
import { cn } from '../lib/cn';

export function AutoRulesPage() {
  const rules = useBudget((s) => s.autoRules);
  const categories = useBudget((s) => s.categories);
  const accounts = useBudget((s) => s.accounts);
  const nav = useNavigate();

  const [tab, setTab] = useState<'category' | 'transfer'>('category');
  const [newPattern, setNewPattern] = useState('');
  const [newCatId, setNewCatId] = useState('');
  const [newOverride, setNewOverride] = useState(false);
  const [newFromAcct, setNewFromAcct] = useState('');
  const [newToAcct, setNewToAcct] = useState('');

  const categoryRules = rules.filter((r) => r.kind !== 'transfer');
  const transferRules = rules.filter((r) => r.kind === 'transfer');

  function addCategoryRule() {
    if (!newPattern.trim() || !newCatId) return;
    createAutoRule({
      pattern: newPattern.trim(),
      categoryId: newCatId,
      override: newOverride,
      kind: 'category',
    });
    setNewPattern('');
    setNewCatId('');
    setNewOverride(false);
    toast.success('Rule added');
  }

  function addTransferRule() {
    if (!newPattern.trim() || !newToAcct) return;
    createAutoRule({
      pattern: newPattern.trim(),
      categoryId: '',
      override: false,
      kind: 'transfer',
      fromAccountId: newFromAcct || undefined,
      toAccountId: newToAcct,
    });
    setNewPattern('');
    setNewFromAcct('');
    setNewToAcct('');
    toast.success('Transfer rule added');
  }

  return (
    <div className="max-w-3xl mx-auto">
      <MobilePageHeader
        title="Auto-rules"
        subtitle={`${categoryRules.length} categorize · ${transferRules.length} transfer`}
      />
      <div className="p-3 sm:p-5 space-y-4">
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => nav(-1)}
            className="text-fg-muted hover:text-fg p-1.5 rounded hover:bg-surface-2"
            aria-label="Back"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="text-[15px] font-semibold flex items-center gap-1.5">
            <Wand2 size={15} className="text-accent" /> Auto-rules
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-surface-2/40 rounded-lg w-fit">
          <button
            onClick={() => setTab('category')}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12.5px] font-medium flex items-center gap-1.5',
              tab === 'category' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted',
            )}
          >
            <Tag size={12} /> Categorize ({categoryRules.length})
          </button>
          <button
            onClick={() => setTab('transfer')}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12.5px] font-medium flex items-center gap-1.5',
              tab === 'transfer' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted',
            )}
          >
            <ArrowLeftRight size={12} /> Transfer ({transferRules.length})
          </button>
        </div>

        {tab === 'category' ? (
          <CategorySection
            rules={categoryRules}
            categories={categories}
            newPattern={newPattern}
            setNewPattern={setNewPattern}
            newCatId={newCatId}
            setNewCatId={setNewCatId}
            newOverride={newOverride}
            setNewOverride={setNewOverride}
            onAdd={addCategoryRule}
          />
        ) : (
          <TransferSection
            rules={transferRules}
            accounts={accounts}
            newPattern={newPattern}
            setNewPattern={setNewPattern}
            newFromAcct={newFromAcct}
            setNewFromAcct={setNewFromAcct}
            newToAcct={newToAcct}
            setNewToAcct={setNewToAcct}
            onAdd={addTransferRule}
          />
        )}
      </div>
    </div>
  );
}

function CategorySection({
  rules, categories,
  newPattern, setNewPattern, newCatId, setNewCatId, newOverride, setNewOverride, onAdd,
}: any) {
  return (
    <>
      <div className="glass-panel p-4 sm:p-5 space-y-3">
        <div className="text-[12.5px] text-fg-muted leading-snug">
          When a new transaction&apos;s payee name contains your pattern, we apply the chosen category.
          Patterns are case-insensitive substring matches.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_auto_auto] gap-2">
          <Input value={newPattern} onChange={(e: any) => setNewPattern(e.target.value)} placeholder="When payee contains… (e.g. trader joe)" />
          <Select value={newCatId} onChange={(e: any) => setNewCatId(e.target.value)}>
            <option value="">— Apply category —</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-[12px] text-fg-muted whitespace-nowrap">
            <input type="checkbox" checked={newOverride} onChange={(e: any) => setNewOverride(e.target.checked)} className="accent-accent" />
            Override existing
          </label>
          <Button variant="primary" onClick={onAdd} disabled={!newPattern.trim() || !newCatId}>
            <Plus size={13} /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="glass-panel p-6 text-center text-fg-subtle text-[13px]">
            No category rules yet. Common picks: "trader joe" → Groceries, "uber" → Rideshare, "spotify" → Subscriptions.
          </div>
        ) : (
          rules.map((r: any) => (
            <div key={r.id} className="glass-panel p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13px] font-medium">When payee contains</span>
                  <Input
                    value={r.pattern}
                    onChange={(e: any) => updateAutoRule(r.id, { pattern: e.target.value })}
                    className="text-[12.5px] inline-block w-auto min-w-[160px]"
                  />
                  <span className="text-[13px] text-fg-muted">→</span>
                  <Select
                    value={r.categoryId}
                    onChange={(e: any) => updateAutoRule(r.id, { categoryId: e.target.value })}
                    className="text-[12.5px] inline-block w-auto min-w-[140px]"
                  >
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <label className="flex items-center gap-1.5 text-[11.5px] text-fg-muted mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.override}
                    onChange={(e: any) => updateAutoRule(r.id, { override: e.target.checked })}
                    className="accent-accent"
                  />
                  Override existing categorizations on new txns
                </label>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const { updated } = applyAutoRuleToHistory(r.id);
                    toast.success(`Recategorized ${updated} historical transaction${updated === 1 ? '' : 's'}`);
                  }}
                  title="Apply to all matching past transactions"
                >
                  <Wand2 size={12} /> Apply to past
                </Button>
                <button
                  onClick={() => {
                    if (confirm('Delete this rule?')) {
                      deleteAutoRule(r.id);
                      toast.success('Rule deleted');
                    }
                  }}
                  className={cn('text-fg-subtle hover:text-negative p-2 rounded')}
                  aria-label="Delete rule"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function TransferSection({
  rules, accounts,
  newPattern, setNewPattern, newFromAcct, setNewFromAcct, newToAcct, setNewToAcct, onAdd,
}: any) {
  return (
    <>
      <div className="glass-panel p-4 sm:p-5 space-y-3">
        <div className="text-[12.5px] text-fg-muted leading-snug">
          When a new transaction&apos;s payee matches, convert it into a paired transfer between accounts —
          no categorization. Use this for regular savings transfers, credit-card payments paid from checking,
          and similar &quot;same money, different account&quot; movements.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2">
          <Input value={newPattern} onChange={(e: any) => setNewPattern(e.target.value)} placeholder="When payee contains… (e.g. transfer to savings)" />
          <Select value={newFromAcct} onChange={(e: any) => setNewFromAcct(e.target.value)}>
            <option value="">— Any from account —</option>
            {accounts.filter((a: any) => !a.closed).map((a: any) => <option key={a.id} value={a.id}>From: {a.name}</option>)}
          </Select>
          <Select value={newToAcct} onChange={(e: any) => setNewToAcct(e.target.value)}>
            <option value="">— Pick destination —</option>
            {accounts.filter((a: any) => !a.closed).map((a: any) => <option key={a.id} value={a.id}>To: {a.name}</option>)}
          </Select>
          <Button variant="primary" onClick={onAdd} disabled={!newPattern.trim() || !newToAcct}>
            <Plus size={13} /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="glass-panel p-6 text-center text-fg-subtle text-[13px]">
            No transfer rules yet. Example: &quot;transfer to savings&quot; from Checking → Savings.
          </div>
        ) : (
          rules.map((r: any) => {
            const fromAcct = accounts.find((a: any) => a.id === r.fromAccountId);
            const toAcct = accounts.find((a: any) => a.id === r.toAccountId);
            return (
              <div key={r.id} className="glass-panel p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-medium">When payee contains</span>
                    <Input
                      value={r.pattern}
                      onChange={(e: any) => updateAutoRule(r.id, { pattern: e.target.value })}
                      className="text-[12.5px] inline-block w-auto min-w-[160px]"
                    />
                    <span className="text-[13px] text-fg-muted">→ transfer to</span>
                    <Select
                      value={r.toAccountId ?? ''}
                      onChange={(e: any) => updateAutoRule(r.id, { toAccountId: e.target.value })}
                      className="text-[12.5px] inline-block w-auto min-w-[140px]"
                    >
                      {accounts.filter((a: any) => !a.closed).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  </div>
                  <div className="text-[11.5px] text-fg-subtle mt-1">
                    Source: <select
                      value={r.fromAccountId ?? ''}
                      onChange={(e: any) => updateAutoRule(r.id, { fromAccountId: e.target.value || undefined })}
                      className="bg-transparent text-fg-muted underline-offset-2 hover:underline"
                    >
                      <option value="">any account</option>
                      {accounts.filter((a: any) => !a.closed).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {fromAcct && toAcct && <> · {fromAcct.name} → {toAcct.name}</>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm('Delete this rule?')) {
                      deleteAutoRule(r.id);
                      toast.success('Rule deleted');
                    }
                  }}
                  className={cn('text-fg-subtle hover:text-negative p-2 rounded flex-shrink-0')}
                  aria-label="Delete rule"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

export default AutoRulesPage;
