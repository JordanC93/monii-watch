/**
 * In-app help database (v0.6.2). One article per concept, written for
 * users who have never used a budgeting app before. To add a new
 * article, append an entry — no other code changes needed.
 *
 * Style guide:
 *   - Plain English. No jargon without definitions.
 *   - Short paragraphs. Bullet points where they help.
 *   - Concrete examples with small numbers.
 *   - Lead with the user's question, not the feature name.
 */

export type HelpArticle = {
  id: string;
  /** Short title, the way the user would search for it. */
  title: string;
  /** Section grouping for the table of contents. */
  category: HelpCategory;
  /** Searchable keywords (in addition to title + body). */
  tags: string[];
  /** Markdown-ish content. Headings start lines with ##; paragraphs are
   *  separated by blank lines; bullets start with `- `. */
  body: string;
};

export type HelpCategory =
  | 'getting-started'
  | 'budgeting-basics'
  | 'transactions'
  | 'accounts'
  | 'goals'
  | 'reports'
  | 'sync-privacy'
  | 'troubleshooting'
  | 'advanced';

export const HELP_CATEGORIES: Array<{ id: HelpCategory; label: string; description: string }> = [
  { id: 'getting-started', label: 'Getting started', description: 'Brand new? Start here.' },
  { id: 'budgeting-basics', label: 'Budgeting basics', description: 'How envelope budgeting works.' },
  { id: 'transactions', label: 'Transactions', description: 'Adding, editing, importing, splitting.' },
  { id: 'accounts', label: 'Accounts', description: 'Checking, savings, credit cards, loans.' },
  { id: 'goals', label: 'Goals & savings', description: 'Save for things that matter.' },
  { id: 'reports', label: 'Reports & insights', description: 'Find patterns in your money.' },
  { id: 'sync-privacy', label: 'Sync & privacy', description: 'Multiple devices, no servers.' },
  { id: 'advanced', label: 'Advanced features', description: 'FIRE planner, workspaces, multi-currency, hard limits.' },
  { id: 'troubleshooting', label: 'Troubleshooting', description: 'When things go sideways.' },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------------- Getting started -----------------------------------
  {
    id: 'what-is-monii',
    title: 'What is Monii Watch?',
    category: 'getting-started',
    tags: ['intro', 'overview', 'what', 'about'],
    body: `
Monii Watch is a budgeting app that helps you decide where every dollar
goes BEFORE you spend it. It's based on the "envelope method" — you
imagine your money living in labeled envelopes (Rent, Groceries, Fun
Money), and you only spend from each envelope what's inside it.

## What makes it different

- **Your data lives on your device, not on a server.** Nothing is
  uploaded anywhere by default.
- **No accounts, no signup.** Open the app and start.
- **Sync between your devices** is optional and end-to-end encrypted —
  you pair them with a phrase only you know.
- **No bank linking.** You enter transactions yourself (or paste / OCR
  from receipts and statements). This is intentional: it keeps your
  bank credentials private and forces you to actually look at where
  your money goes.

## What it's good for

- Knowing exactly how much you can spend on dining this week
- Saving for goals (vacation, new laptop, emergency fund)
- Catching subscription creep before it adds up
- Reviewing your spending at the end of each month
`,
  },
  {
    id: 'first-week',
    title: 'Your first week with Monii',
    category: 'getting-started',
    tags: ['first time', 'getting started', 'tutorial', 'walkthrough', 'beginner'],
    body: `
The fastest way to get value from Monii is to do these five things in
order. Don't skip ahead — each step builds on the last.

## Day 1 — Add your accounts

Tap **+ New account** in the sidebar (or More → All accounts on
mobile). Add every account you actually use: checking, savings, credit
cards, cash. The opening balance should match what's in your account
RIGHT NOW. Don't worry about old transactions — you start fresh.

## Day 1 — Set your monthly income

Go to **Settings → General → Monthly income**. Enter your take-home
pay (after taxes). If you're paid bi-weekly, also set Pay frequency
and Last paycheck date — it makes everything else more accurate.

## Day 2 — Plan your envelopes

Open the **Budget** tab. You'll see categories grouped by type
(Bills, Food, Transportation, etc.). For each one, type the dollar
amount you want to spend this month. The big number at the top —
**Ready to Assign** — is your unspent income. Your goal: get it to
zero. Every dollar has a job.

## Day 3-7 — Record what you spend

Each time you spend money, add a transaction. The fastest way:
tap the **Add transaction** floating button (mobile) or use **⌘K**
(desktop) and type something like "Spent $12 at Chipotle on dining".
Or use **Add receipt** to take a picture of a receipt and let the
OCR fill the form.

## End of week — Check the budget

The Budget page now shows what you spent vs what you assigned. Green
numbers mean you're under budget. Red means you overspent — pull
money from another envelope to cover it.

## End of month — Monthly review

A modal automatically asks "How was the month?" on the 1st. Rate it
1-5 and write a few words. Over time this becomes your money journal.
`,
  },
  {
    id: 'envelope-method',
    title: 'What is "envelope budgeting"?',
    category: 'budgeting-basics',
    tags: ['envelope', 'method', 'ynab', 'concept'],
    body: `
Envelope budgeting is a 100-year-old idea: take your monthly income,
divide it into labeled envelopes (Rent, Food, Gas), and only spend
from each envelope what's inside. When the envelope is empty, you
stop spending in that category.

## Why it works

Most budgeting failures come from the same trap: you spend money on
small things you didn't plan for, and at the end of the month you
wonder where it went. The envelope method forces you to plan first.
You decide that Dining gets $200 this month. If you've already spent
$180, you know dinner out tonight comes out of next month's pizza
budget — or out of a different envelope you'd rather not raid.

## How Monii implements it

Three numbers per category, every month:

- **Assigned** — how much you put in the envelope this month
- **Activity** — how much you've spent (negative) or gotten back
  (positive)
- **Available** — what's left to spend

When you add a transaction, the Activity number updates. When you
edit Assigned, the Available follows. If Available goes negative
(red), you've overspent — Monii nudges you to cover it from another
envelope.

## Rolling over

Money you don't spend in an envelope rolls over to next month. Save
$50 of your $200 dining budget in April? Then May starts with $250
in dining (your rollover plus the new $200 you assign). This is why
Monii tracks "Available" not "Assigned this month" — what matters is
what's actually in the envelope right now.
`,
  },
  // ---------------- Budgeting basics -----------------------------------
  {
    id: 'ready-to-assign',
    title: 'What is "Ready to Assign"?',
    category: 'budgeting-basics',
    tags: ['rta', 'ready to assign', 'unassigned', 'budget'],
    body: `
**Ready to Assign** is the dollar amount you've earned but haven't
told an envelope to hold yet. It's at the top of the Budget page.

## Goal: get it to zero

Every dollar should have a job. If your Ready to Assign is $1,500,
that's $1,500 floating around with no plan — usually it gets spent on
random things you don't notice.

The fix: tap any category and add to its Assigned amount until Ready
to Assign drops to zero. Common categories to load up first:

- **Rent / mortgage** — your biggest fixed bill
- **Bills** (utilities, internet, phone)
- **Groceries**
- **Transportation** (gas, transit)
- **Savings goals** — emergency fund, vacation

## Negative Ready to Assign

If it goes negative (red), you've over-assigned — you've told your
envelopes to hold more money than you actually have. Pull some back
from a low-priority category until it's at zero or above.
`,
  },
  {
    id: 'overspending',
    title: 'I overspent. What now?',
    category: 'budgeting-basics',
    tags: ['overspent', 'overspending', 'red', 'negative', 'cover'],
    body: `
Don't panic. Overspending happens. Monii has a one-tap fix.

## The "Cover overspending" banner

When any category goes red (negative Available), Monii shows an
**Overspending alert** above the budget table. Tap **Cover from
Ready to Assign** and it pulls just enough money from your unspent
RTA to bring every red category back to zero.

## What if Ready to Assign is also empty?

Then you have to move money between envelopes. Decide which envelope
can give some up. Common candidates: the "fun money" / "discretionary"
envelope, or whatever non-essential goal you're saving for.

To move money: on desktop, **drag the green pill** from one row onto
another. On mobile, tap the pill and pick a destination. Or go to
the **chat panel** (⌘J) and type "move $50 from dining to groceries".

## Why it matters

Letting overspending sit means the next month starts with a deficit.
Cover it now and you start each month clean.
`,
  },
  {
    id: 'safe-to-spend',
    title: 'What does "safe to spend" mean?',
    category: 'budgeting-basics',
    tags: ['safe', 'daily', 'paycheck', 'days', 'banner'],
    body: `
The blue banner above the Budget table shows three numbers:

1. **Days until your next paycheck** — based on the pay schedule you
   set in Settings.
2. **Cash on hand** — total liquid money in your checking, savings,
   and cash accounts (NOT credit card limits).
3. **Safe to spend per day** — how much you can spend each day without
   running out before payday.

The math: cash on hand minus upcoming scheduled bills, divided by
days until payday. So if you have $1,000 and $400 in scheduled bills
before payday in 10 days, your safe daily spend is $60.

## When it's hidden

If you haven't set a pay frequency yet, the banner doesn't show
because the math is meaningless. Set Pay frequency in **Settings →
General**.
`,
  },
  // ---------------- Transactions ---------------------------------------
  {
    id: 'add-transaction',
    title: 'How do I add a transaction?',
    category: 'transactions',
    tags: ['add', 'create', 'new', 'transaction', 'expense', 'income'],
    body: `
Three ways, fastest first:

## 1. Chat panel (⌘J or tap the chat icon)

Type natural English: "Spent $12 at Chipotle on dining" or "$45.20
for gas yesterday". The chat parses the amount, vendor, category,
and date, then asks for any missing info.

## 2. The floating + button (mobile) / QuickAdd bar (desktop)

A small form at the bottom of the Account page or floating action
button on Budget page. Pick payee, amount, category — done.

## 3. Receipt OCR

Tap **Add receipt** in the chat panel or Command Palette (⌘K) →
Upload receipt. Take a photo or pick a file; Monii reads the vendor
+ amount + date and pre-fills the form. Works on PDFs too. The
receipt image is stored alongside the transaction.

## Inflows vs outflows

Outflows (spending) are negative numbers. Inflows (paychecks,
refunds) are positive. Don't think about signs — Monii infers them
from words like "spent" / "got paid" / "received".

## Categories vs Ready-to-Assign

For expenses, pick a category. For income (paychecks, etc.), leave
the category blank — the money lands in Ready to Assign so you can
distribute it.
`,
  },
  {
    id: 'split-transaction',
    title: 'How do I split a transaction across categories?',
    category: 'transactions',
    tags: ['split', 'multiple', 'categories'],
    body: `
A split transaction divides one charge across multiple categories.
Useful when you buy groceries AND household items at the same store.

## How to split

1. Open the transaction (click the row in the transaction table)
2. Tap the **Split** button
3. Add a row for each category. Adjust the amounts so they sum to
   the original total.
4. Save.

The transaction shows up as one row in the table, but the budget
page subtracts the right amount from each envelope.

## Example

A $87 Costco trip might be:
- Groceries: $62
- Household: $20
- Pet food: $5
`,
  },
  {
    id: 'one-time-flag',
    title: 'What is "Mark as one-time"?',
    category: 'transactions',
    tags: ['one-time', 'outlier', 'mark', 'one time', 'unusual'],
    body: `
A one-time flag tells Monii "this transaction is a fluke — don't use
it to predict my normal spending."

## When to use it

- A big couch you bought once. Without the flag, Furniture would
  look like a $1,200/month category in your trends.
- Wedding gift, surgery copay, plane ticket for a one-off trip.
- Anything that would mislead the trend lines.

## How

Right-click the transaction (long-press on mobile) → **Mark as
one-time**. The transaction stays where it is and counts toward
your overall budget — but it's excluded from:

- Category trailing averages ("you usually spend X")
- Cash flow forecast variable spending baseline
- What-if scenario projections
- The right-sized emergency fund recommendation

You can unmark anytime if you change your mind.
`,
  },
  {
    id: 'cost-per-use',
    title: 'How does "Cost per use" work?',
    category: 'transactions',
    tags: ['cost per use', 'usage', 'tracker'],
    body: `
Some purchases are worth tracking by how often you actually use them.
Bought a $200 bike helmet? Worn it once = $200 per use. Worn it 100
times = $2.

## Setup

1. Right-click the purchase transaction → **Track usage — +1**
2. Each time you use the thing, hit the same menu item again

Monii adds up your taps over time. Eventually you can ask the chat
panel "what's my cost per use on the bike helmet" or look at the
linked goal tile if it's tied to a category.

## Why bother

It changes your relationship with stuff. The $400 air fryer that
makes dinner three times a week is great. The $400 stand mixer
that's used twice a year is not.
`,
  },
  {
    id: 'import-statement',
    title: 'How do I import a bank statement?',
    category: 'transactions',
    tags: ['import', 'csv', 'statement', 'ofx', 'qfx', 'paste'],
    body: `
Two paths. Both end at a review screen where you can deselect rows
and tweak categories before saving.

## File upload

1. Open Settings → Backup & Import (or use ⌘K → Upload receipt)
2. Pick a CSV, OFX, QFX, or PDF statement
3. Monii parses the rows and shows a review table
4. Uncheck duplicates, set categories, hit Save

## Copy-paste

If your bank doesn't export but you can SELECT all rows on the
website, copy them to your clipboard and paste into the
**Bulk paste** modal (⌘K → Bulk paste). Same review flow.

## Duplicates

Monii auto-detects rows that look like they're already in your
account (same date, amount, payee within ±2 days) and **deselects
them with a warning**. You can re-check them if they're legit.
`,
  },
  {
    id: 'receipt-attach',
    title: 'How do I attach a receipt?',
    category: 'transactions',
    tags: ['receipt', 'photo', 'image', 'pdf', 'attach', 'gallery', 'ocr'],
    body: `
Receipts can come in several ways:

## When you add the transaction via OCR

Upload the photo / PDF in the **Add receipt** flow (⌘K → Upload
receipt). The image is stored with the transaction automatically.

## After the fact

1. Open the transaction
2. Tap the receipt slot → upload an image or PDF
3. The image is resized to keep the database small (long edge ≤
   600px for images; PDFs get the first page rasterized to a JPEG)

## Search by content

The OCR'd text from a receipt is searchable. On the Search page or
Receipts gallery (More → Receipts), type "wood stain" or "ground
beef" and Monii finds the receipt that contained those words.
`,
  },
  // ---------------- Accounts -------------------------------------------
  {
    id: 'add-account',
    title: 'How do I add an account?',
    category: 'accounts',
    tags: ['add', 'new', 'account', 'checking', 'savings'],
    body: `
1. Sidebar → **+ New account** (or More → All accounts → New)
2. Pick a type. The most common: Checking, Savings, Credit Card, Cash
3. Set the opening balance to what's in the account RIGHT NOW
4. (Optional) Set currency or pin to top of the sidebar

For credit cards, also fill in:
- **Credit limit** — enables utilization tracking
- **APR** — drives debt-payoff projections
- **Statement closing day** + **Payment due day** — drives reminders

You can edit any of this later via Edit on the account.
`,
  },
  {
    id: 'reconcile',
    title: 'What does "reconcile" do?',
    category: 'accounts',
    tags: ['reconcile', 'reconciliation', 'matching', 'cleared'],
    body: `
Reconciling means "tell Monii my real bank balance, and it'll catch
up by inserting an adjustment if needed."

## When to reconcile

Monthly, when your bank statement arrives. Open the account → tap
**Reconcile**. Enter the cleared balance from the statement.

If the number matches what Monii thinks the cleared balance should
be, you're done. If they differ, Monii adds a "Reconciliation
adjustment" transaction so they match.

## Cleared vs uncleared

Each transaction has a state:
- **Uncleared** — entered, but the bank hasn't posted it yet
- **Cleared** — the bank confirmed the charge
- **Reconciled** — locked in by a reconciliation event

Mark transactions cleared when they show up on your bank's online
view. Reconciliation locks all currently-cleared transactions.
`,
  },
  {
    id: 'credit-cards',
    title: 'How do credit cards work in Monii?',
    category: 'accounts',
    tags: ['credit card', 'credit', 'utilization', 'apr', 'visa', 'mastercard'],
    body: `
Credit cards work a little differently than checking accounts.

## Balance is negative

When you charge $50 on a card, your card balance is **-$50** (you
owe $50). Paying it down brings the balance back toward zero.

## Auto-created payment category

Monii makes a "Credit Card Payments" group with one category per
card. Each month you assign money to that category — that's the
money set aside to pay the card off. When you pay the card (a
transfer from checking to the card), it pulls from the assigned
amount.

## Credit Cards page

The dedicated page (More → Credit cards) shows for each card:
- Current balance
- Utilization (% of limit used) with a color band
- Days until statement closes
- Days until payment due
- Monthly interest if you carry the balance

## Pre-statement utilization alerts

If utilization is over 30% AND statement closes within 3 days,
Monii surfaces a banner urging you to pay down to under 30% before
reporting. This is a free credit-score win.
`,
  },
  // ---------------- Goals ----------------------------------------------
  {
    id: 'goals-types',
    title: 'What kinds of goals can I set?',
    category: 'goals',
    tags: ['goal', 'goals', 'target', 'savings', 'monthly funding', 'annual'],
    body: `
Four flavors of goals. Pick the one that fits your situation.

## Monthly funding (recurring bill)

"Put $300 toward Rent every month." Use this for fixed bills that
need to be funded fresh each month.

## Target balance (one-off save-up)

"Save $2,000 for a new laptop." No deadline. Monii projects when
you'll get there at your current saving rate.

## Target by date (deadline-bound save-up)

"Save $4,000 for a vacation by July 15." Monii calculates the
monthly contribution you need and tells you if you're ahead or
behind.

## Annual (birthday / anniversary fund)

"Save $600 for family birthdays by December 15." Auto-rolls forward
to next year on the trigger date.

## Where to set goals

Two options:
- **Add Goal modal** (Goals page → New goal): full setup including
  photo, link, notes
- **Edit Category modal**: simpler if the category already exists
`,
  },
  {
    id: 'emergency-fund',
    title: 'How do I build an emergency fund?',
    category: 'goals',
    tags: ['emergency', 'fund', 'savings', '3 months', '6 months'],
    body: `
The classic advice: keep 3-6 months of expenses in savings, separate
from your daily checking.

## Right-size the target

Settings → Emergency fund. Pick how many months you want (3 is
basic, 6 is recommended). Monii looks at your actual trailing
spending and tells you the target dollar amount.

If you spend $4,000/month on average, a 6-month fund is $24,000.

## Link a category

Pick or create a category for the fund (e.g. "Emergency"). Link it
in Settings. The Goals page now shows a pinned **Right-sized
emergency fund** tile with progress.

## Build it gradually

Don't try to save it all in one month. Add it to your monthly
budget — say $200 a month. Over time, the trailing-rate projection
on the Goals page shows when you'll hit the target.

When you reach the target, the tile hides itself.
`,
  },
  {
    id: 'goal-deal',
    title: 'What is a "deal alert"?',
    category: 'goals',
    tags: ['deal', 'alert', 'price', 'goal', 'target item'],
    body: `
You're saving for a $1,500 laptop. You set the target item price to
$1,500 in the goal. Then one day Apple drops the price to $1,300.
You've already saved $1,300. Buy it now!

That's a deal alert.

## Setup

1. Open the goal category → Edit
2. Set **Target item price** (the original sticker price)
3. Set **Current item price** (what it costs right now)
4. Optionally add a **Link** to the store page

## What you'll see

When the **Available** in the envelope ≥ the **Current item price**,
Monii surfaces a banner on the Budget page with a "Open store page"
link. The alert can be silenced for 90 days per goal.

A separate "you reached the original goal" alert fires when
Available reaches the **Target item price** — that one can't be
silenced.

## Updating prices

We don't fetch from store websites (that would leak data through a
proxy server). You update prices manually. A future server-side
price-checker plugin could fill this in.
`,
  },
  // ---------------- Reports --------------------------------------------
  {
    id: 'reports-overview',
    title: 'What reports does Monii have?',
    category: 'reports',
    tags: ['reports', 'insights', 'overview', 'analytics'],
    body: `
The Reports tab has many cards. Most are derived from your existing
data — no setup needed beyond entering transactions. Highlights:

- **Financial Health Scorecard** — six dimensions (savings rate,
  emergency fund, debt-to-income, credit utilization, subscription
  bloat, variable spend) with green/yellow/red and improvement
  suggestions
- **Cash Flow Forecast** — projects your balance forward 30/60/90
  days using scheduled bills + recent spending averages
- **Year over Year** — this YTD vs same range last year, by category
- **Bills & Spending Trend** — multi-line chart showing how your
  utilities + variable bills move month-to-month
- **Day of week** — heatmap showing which days you spend most
- **Sankey money flow** — income on the left, categories on the
  right, all the rivers in between
- **Tax Summary** — everything tax-deductible aggregated for the
  year, exportable as CSV

## Customize

Hit **Customize** at the top of the Reports page to hide / reorder
cards. Local to your device.
`,
  },
  {
    id: 'category-drill-down',
    title: 'How do I see one category in detail?',
    category: 'reports',
    tags: ['category', 'detail', 'drill', 'electricity', 'utilities', 'breakdown'],
    body: `
Click the **Spent** number on any budget row. That opens the
category detail page with:

- 12-month bar chart with last-year overlay (great for variable
  bills like electricity)
- Average / median / highest / lowest months
- Variability insight ("3.2× swing — peaks in July")
- Top payees in this category
- Last 30 transactions

## Use cases

- **Variable bills** — electricity, gas, water, internet. See the
  seasonal pattern.
- **Discretionary spending** — dining, entertainment. See if it's
  drifting up over time.
- **Travel** — total YTD vs last year.
`,
  },
  {
    id: 'unusual-transactions',
    title: 'What does "unusual transaction" mean?',
    category: 'reports',
    tags: ['unusual', 'anomaly', 'surprise', 'alert', 'large'],
    body: `
Monii flags recent charges that are meaningfully larger than the
payee's typical amount. It's a "are you sure that's right?" prompt,
not an alarm.

## How it works

For each payee, Monii looks at the last 6 months of charges. It
flags new charges that are:

- More than 2 standard deviations above the payee's mean, OR
- More than 2× the payee's median amount

Plus the charge has to be over $20 (small-dollar noise stays quiet).

## Where it shows up

The Budget page banner: "3 unusual transactions this week — review."
Tap to expand and see the list. Each row has:

- The amount and what's typical
- A **Review** button that jumps to the transaction
- A dismiss for that row

## Why dismiss

Sometimes the charge is legit (you really did spend $300 at Target
this once). Dismissing keeps the alert from re-firing on every page
load.
`,
  },
  // ---------------- Sync & privacy -------------------------------------
  {
    id: 'sync-overview',
    title: 'How does sync work?',
    category: 'sync-privacy',
    tags: ['sync', 'pair', 'devices', 'webrtc', 'phrase'],
    body: `
Sync is OFF by default. You opt in.

## How to pair devices

1. On device A, open **Settings → Sync → Configure**
2. Toggle Sync ON. Monii generates a 3-word **pairing phrase**
   ("forest-lemon-spark", say)
3. On device B, do the same — enter the SAME phrase
4. Devices find each other and merge their data within seconds

The pairing phrase is the encryption key. Anyone who knows it can
sync to your data. Treat it like a password.

## What sync uses

- **WebRTC** — direct peer-to-peer, the default. Works as long as
  both devices are online at some point.
- **Self-hosted server** (advanced) — set a y-websocket URL in
  Sync settings. Useful if you have a home server / Pi.
- **Google Drive** (E2E encrypted) — opt-in. Stores an encrypted
  snapshot in your own Drive. Google holds the bytes but can't
  decrypt them.

## Resetting the phrase

Don't! The phrase is the key. If you lose all devices, the data is
gone. Export a backup occasionally (Settings → Backup) to be safe.
`,
  },
  {
    id: 'privacy',
    title: 'Where is my data stored?',
    category: 'sync-privacy',
    tags: ['privacy', 'data', 'where', 'security', 'storage'],
    body: `
On YOUR devices. Specifically:

## Browser PWA

In your browser's **IndexedDB**. A specific database named
\`monii-watch-doc-v1\`. It stays there until you clear it or
uninstall the app.

## Tauri desktop apps (Mac, Windows, Linux)

Same IndexedDB, scoped to the Tauri WebView's local storage. Lives
in your OS user directory.

## Sync transports (when enabled)

- **WebRTC**: data is encrypted with your pairing phrase before
  leaving your device. Public signaling servers help devices find
  each other but never see your data.
- **Self-hosted**: encrypted with the same phrase before sending.
- **Google Drive**: encrypted with XChaCha20-Poly1305 + Argon2id
  derived from the phrase before upload.

## What we DON'T do

- No analytics
- No "anonymous usage data"
- No third-party SDKs
- No bank linking (Plaid etc.)
- No AI / LLM services
`,
  },
  {
    id: 'backup',
    title: 'How do I back up my data?',
    category: 'sync-privacy',
    tags: ['backup', 'export', 'restore', 'json', 'encrypted'],
    body: `
Monii has two export formats and two import paths.

## Plain JSON export

Settings → Backup & Import → **Export JSON**. Downloads a
\`monii-watch-YYYY-MM-DD.json\` with everything: accounts,
transactions, categories, settings.

## Encrypted export (.cb-backup)

Settings → Backup & Import → **Export encrypted**. Pick a
passphrase. Same data but encrypted with XChaCha20-Poly1305 +
Argon2id (military-grade). Use this if you're emailing the file
to yourself or storing it in a less-trusted location.

## Restore

Settings → Backup & Import → **Import**. Two modes:
- **Merge** — adds the contents alongside what's there
- **Replace all** — wipes the current state and replaces (USE WITH
  CARE)

Encrypted backups auto-detect the magic header and prompt for the
passphrase.

## When to back up

- Before any major change (cleaning up categories, deleting accounts)
- Once a month, on a schedule
- Before switching devices (in addition to syncing)
`,
  },
  // ---------------- Troubleshooting ------------------------------------
  {
    id: 'reset-everything',
    title: 'How do I start over from scratch?',
    category: 'troubleshooting',
    tags: ['reset', 'wipe', 'start over', 'delete'],
    body: `
Settings → Danger zone → **Reset everything**. This wipes:

- All accounts, categories, transactions, assignments
- Sync configuration (pairing phrase resets)
- Local prefs (themes, density, sidebar order)
- Service worker caches

Then it reloads the app and you start fresh with the demo data.

## Before you do this

Export a backup first. Just in case.

## When the button doesn't seem to work

If it looks like the wipe didn't take, try uninstalling the app
(or clearing browser data for the site) and reopening. The async
deletion can be blocked if a sync provider is mid-flight.
`,
  },
  {
    id: 'sync-not-working',
    title: 'Sync isn\'t working between my devices',
    category: 'troubleshooting',
    tags: ['sync', 'broken', 'not working', 'pairing', 'connection'],
    body: `
A checklist:

## Both devices have the SAME pairing phrase?

Settings → Sync → Configure. The phrase is case-sensitive and
hyphenated. Even "forest lemon spark" and "Forest-Lemon-Spark" are
different. Type carefully.

## Both devices online?

WebRTC needs both peers to be reachable on the network. If one is
on a restrictive corporate network, P2P may fail.

## Try the self-hosted server (advanced)

If WebRTC isn't reaching your peers, you can run a tiny
y-websocket server (the \`server/\` folder in the source has a
Docker Compose drop-in). Set the URL in Sync → Self-hosted server.

## Last resort: import / export

If sync just won't connect, export from device A (Settings →
Backup → Export JSON) and import on device B (Backup → Import).
Not real-time but always works.
`,
  },
  {
    id: 'numbers-look-wrong',
    title: 'My budget numbers look wrong',
    category: 'troubleshooting',
    tags: ['wrong', 'incorrect', 'broken', 'math', 'available'],
    body: `
Common causes, in order of likelihood:

## You haven't set Ready to Assign to zero

If RTA is huge and your envelopes look empty, you have unassigned
income. Distribute it to envelopes.

## Carry-over from previous months

Available = assigned this month + activity this month + carry from
prior months. If a category is in the red because of a previous
overspend, the carry follows you.

## Filter on the wrong month

Make sure you're looking at the right month at the top of the
Budget page. The picker is in the title bar.

## Closed accounts

Closed accounts don't contribute to the budget. Settings → All
accounts → check if anything you expected to count is closed.

## Tracking accounts

Investment, loan, and mortgage accounts are NOT on-budget. Their
balances show in Net Worth but don't enter the envelope math.

## Try the chat panel

Open the chat (⌘J) and ask "What is my net worth?" or "What's my
PayPal balance?" — Monii reports the raw numbers without the
budget math layered on top, so you can sanity-check.
`,
  },
  {
    id: 'app-frozen',
    title: 'The app froze / a page is blank',
    category: 'troubleshooting',
    tags: ['frozen', 'crash', 'blank', 'broken', 'error', 'recover'],
    body: `
Monii has crash recovery built in.

## If you see "Something went wrong"

That's the error boundary doing its job. Tap **Retry** to try
re-rendering, or **Go to budget** to navigate away. Tap **Copy
report** to grab the technical details — paste them somewhere safe
in case you want to report the bug.

## If the app is just slow / unresponsive

- Try refreshing (browser: F5; Tauri: ⌘R)
- Check Settings → Debug logs for any errors
- If it persists across refresh: try **Reset everything** (export
  a backup first!)

## If a specific report card is broken

The Reports page wraps each card in its own error boundary. One
broken card won't kill the page — others still render.
`,
  },

  // ---------- Advanced (v0.6.3 / v0.6.4) ----------------------------
  {
    id: 'fire-planner',
    title: 'How does the FIRE / retirement planner work?',
    category: 'advanced',
    tags: ['fire', 'retirement', 'monte carlo', 'retire', 'early retirement', 'withdrawal'],
    body: `
The FIRE planner (sidebar → "FIRE planner" or **/fire**) projects
your retirement based on your current net worth, savings rate, and
expected returns.

## What you put in

Open the page and tap **FIRE assumptions**. Fill in:

- **Current age** + **Target retirement age** — when you want to
  stop working
- **Annual spending in retirement** — how much you'll need each
  year (in today's dollars)
- **Expected return** — typical 6-8% nominal for a stock-heavy
  portfolio
- **Return std deviation** — typical 12-18% for stocks
- **Inflation** — typical 2-4%
- **Life expectancy** — most people use 90-95
- **Social Security** (optional) — start age + monthly benefit

Your **current net worth** comes from your accounts. **Annual
contribution** is auto-derived from your trailing 12-month net
(income minus spending).

## What you get

Three FIRE numbers:

- **Lean FIRE (33×)** — conservative, sustains 40+ year retirement
- **FIRE (25×)** — Trinity Study standard
- **Fat FIRE (20×)** — aggressive, shorter horizon

Plus:

- **Deterministic projection** — year-by-year NW assuming things
  go as planned
- **Monte Carlo simulation** (500 runs) — 10th / 50th / 90th
  percentile bands. The 50th is the median outcome; the 10/90 show
  worst- and best-case scenarios
- **Success probability** — what fraction of the 500 simulations
  ran out of money before life expectancy
- **Withdrawal sequencing** — taxable → traditional → Roth, with
  rationale for each step

## Trust this how much?

It's a model. The math is honest but the inputs are guesses. Use it
to ask "am I in the ballpark?" not "exactly when can I retire."
Re-run it whenever your situation changes.
`,
  },
  {
    id: 'workspaces',
    title: 'How do workspaces (multiple budgets) work?',
    category: 'advanced',
    tags: ['workspace', 'workspaces', 'multiple', 'budgets', 'business', 'separate'],
    body: `
A **workspace** is a separate budget — separate accounts,
transactions, categories, sync. Useful when you want to keep
personal money apart from a business or shared household.

## Creating a workspace

Sidebar → tap the workspace footer (or "+ Add workspace" if you
don't have one yet). Click **+ New workspace**. Pick a name like
"Business" or "Household." The app reloads into the new workspace
when you switch.

## How they're isolated

Each workspace is its own IndexedDB database on this device. Your
"Personal" budget never sees "Business" data. Each workspace also
has its own:

- Pairing phrase + sync state
- Google Drive config
- Categories, accounts, transactions, goals — all separate

## What's shared

**Nothing automatic.** Workspaces are local-per-device. You can
sync each one to its own paired phones / laptops, but switching
the active workspace on one device doesn't propagate.

## Switching

Tap the workspace footer in the sidebar → tap **Switch** on the
workspace you want. The app reloads.

## Deleting

Workspaces → trash icon next to a workspace. **Permanent.** Export
a backup first if you might need it. The default "Personal"
workspace can't be deleted.

## Caveat: no cross-workspace transfers

If you need to "move money from Personal to Business," you'll
record that as TWO transactions — one outflow in Personal, one
inflow in Business. Manually. Cross-workspace transfers are not
yet supported.
`,
  },
  {
    id: 'multi-currency',
    title: 'I have accounts in different currencies — how does that work?',
    category: 'advanced',
    tags: ['multi-currency', 'currency', 'foreign', 'eur', 'gbp', 'usd', 'fx', 'exchange', 'rate'],
    body: `
Each account can declare its own currency, separate from your
budget's currency. Useful for travelers, cross-border workers,
or anyone with foreign-currency holdings.

## Setting it up

Edit any account → scroll to **Currency override**. Pick a
currency (USD, EUR, GBP, JPY, etc.). When you pick a non-budget
currency, an **fxRate** field appears.

The fxRate is "1 of THIS currency = how many of the budget
currency." So a EUR account when your budget is USD with EUR/USD
≈ 1.07 has **fxRate: 1.07**.

## What that does

- Account balances + transactions are stored and displayed in
  the account's native currency.
- Envelope math (Ready to Assign, category Available) converts
  to your budget currency using the rate.
- Net worth aggregates everything in the budget currency.

## Why we don't auto-fetch rates

Privacy-first. Browser CORS prevents fetching directly from the
ECB or any FX feed without a proxy server, and we won't run a
proxy that sees your data. Update the rate manually when it
shifts.

## Lock rates per month

For stability, you can record a per-month FX snapshot via
**Settings.fxSnapshots** (this is a power-user feature, no UI
yet — coming soon). Locked rates mean re-entering an old
transaction won't silently shift past months' assignments.
`,
  },
  {
    id: 'hard-limits',
    title: 'What are hard spending limits?',
    category: 'advanced',
    tags: ['hard limit', 'limits', 'cap', 'block', 'velocity', 'overspend'],
    body: `
A **hard spending limit** is a per-category cap that's stricter
than the envelope. The envelope says "this is what you set aside";
the hard limit says "this is the absolute max for the month, no
exceptions."

## Setting one

Edit any category → scroll down → **Hard spending limit**. Enter
a dollar amount per month. Pick a behavior:

- **Warn** — surface a banner on the Budget page when you're
  approaching the limit
- **Block** — show a confirmation prompt before saving any
  transaction that would push you over

## Velocity alerts

Optional: tick **Velocity alert**. With this on, Monii watches
your spending pace mid-month. If by day 10 you've already spent
60% of the limit (well above the 33% pace), it surfaces an
"on track to overshoot" warning even if you're not yet at the
limit.

## When to use this

- A category you keep blowing through (Dining, Entertainment)
- A funding category with a tight ceiling ("max $500/mo into
  this side hustle")
- Setting a cap that doesn't roll over — distinct from envelopes,
  which can be re-funded month after month

## Banner location

Above the budget table on the Budget page. Categories at risk
appear with their state: Velocity-warn / Near-limit / Over.
`,
  },
  {
    id: 'recurring-transfers',
    title: 'How do I set up recurring transfers + auto-escalation?',
    category: 'advanced',
    tags: ['recurring', 'transfer', 'escalation', 'auto-increase', 'contribution', '401k'],
    body: `
A scheduled transfer moves money between two of YOUR accounts on
a recurring basis — distinct from spending or income. Common use:
"every month, move $500 from checking to savings."

## Setup

Sidebar → **Scheduled** → New scheduled transaction. Set the
**Account** (where money LEAVES) + **Transfer to** (where it
ARRIVES). Pick a frequency, start date, and end date (optional).

When the materializer runs (on app boot, idempotent), it creates
TWO transactions on the trigger date — an outflow on the source
account and a paired inflow on the destination.

## Auto-escalation (Tier 9 #5)

The new field **Auto-escalate per year %** lets you compound the
amount each anniversary. Example: a 401k contribution of $200/mo
that you want to grow by 3% every year. Set:

- Amount: $200
- Frequency: Monthly
- Start date: 2026-01-01
- Auto-escalate: 3

Every January 1, the materialized transactions become 3% larger.
After 5 years: $231.85/mo. After 10: $268.78/mo.

## Caveats

The auto-escalation is multiplicative compounding from start date,
NOT from "today." Pausing + resuming doesn't reset the year count.
This is intentional — it gives a stable, deterministic value at
any future point.

To disable, set the % back to 0 (or blank) on the scheduled entry.
`,
  },
  {
    id: 'price-tracker',
    title: 'How do I track when something I want goes on sale?',
    category: 'advanced',
    tags: ['price', 'sale', 'goal', 'tracker', 'paste', 'product'],
    body: `
For physical-item goals (a laptop, a bike, a vacation package),
you can set a **target item price** and update the **current item
price** as it changes. When the current price drops to what you
have available in the envelope, Monii shows a "deal alert" banner
on the Budget + Goals pages.

## Setup

Edit the goal category → set:

- **Target item price** — the original sticker price
- **Current item price** — what it costs right now
- **Link** (optional) — the store page URL

## Updating the price

Two ways:

### 1. Quick number entry
Click the price on the goal tile → type the new amount → save.

### 2. Paste page content
Better for stores with sale + original side by side. From the
goal tile, click "Update price" → paste the page text (Cmd+A,
Cmd+C, Cmd+V from the store). Monii extracts the lowest plausible
price and offers to use it.

The parser filters "Save $200" callouts (anything < 25% of the
max plausible value is treated as a discount amount, not the
product price).

## Chat shortcut

Open chat (⌘J) and type: \`set laptop price to $1299\`. The chat
finds the matching category and updates the price.

## Auto-fetch (coming later)

A future server-side plugin will poll product URLs on a schedule
and update prices automatically. The notification + banner side
already works — only the data pipeline is manual today.
`,
  },
  {
    id: 'calendar-grid',
    title: 'What\'s the difference between Calendar and Calendar grid?',
    category: 'reports',
    tags: ['calendar', 'grid', 'day-by-day', 'view'],
    body: `
Two calendar views:

## /calendar — Heatmap

Color-shaded grid showing how much you spent on each day.
Quickly spot heavy-spending weeks. Best for seeing patterns at a
glance.

## /calendar/grid — Day-by-day grid

Google-Calendar-style month grid. Each day shows the inflow /
outflow totals + transaction count. Click a day to expand a sheet
with every transaction on that date.

Best for: "what did I do on April 15?" or "show me every
transaction in January."

## Switching

Each view has a toggle button to flip to the other.

## Coming later

Drag a transaction between days to re-date it (Tier 10 #6).
`,
  },

  // ---------- Updated reports articles for v0.6.3 features --------
  {
    id: 'runway',
    title: 'What is "runway"?',
    category: 'reports',
    tags: ['runway', 'burn rate', 'fire', 'cash', 'months'],
    body: `
**Runway** = how many months of cash you have if income stops today.

## Where to find it

Reports → Runway card. Shows:

- **Months runway** — color-coded (green ≥ 6, yellow ≥ 3, red below)
- **Cash on hand** — sum of liquid balances (checking, savings,
  cash). Excludes credit limits — those are debt, not runway.
- **Avg monthly burn** — trailing 6-month average outflow,
  excluding one-time-flagged transactions
- **Avg monthly net** — for the "if you keep earning" lens

## Why it matters

A common piece of personal-finance advice is "have 3-6 months of
expenses in liquid savings." Runway tells you exactly where you
stand on that.

## What gets excluded

- One-time transactions (couches, plane tickets) — flag them as
  one-time so they don't inflate the burn rate
- Credit card limits — those add to debt if used, not runway
- Investments — only counted if you'd actually sell them
`,
  },
  {
    id: 'savings-rate-trend',
    title: 'How is my savings rate calculated?',
    category: 'reports',
    tags: ['savings rate', 'trend', '20%', 'target'],
    body: `
**Savings rate = (income − spending) / income** for a given month.

## Where to find it

Reports → Savings rate trend. 12-month line chart with a green
dashed reference line at 20% (the typical "good" threshold).

## Targets

- **20%+** — strong saver
- **5-20%** — typical
- **Under 5%** — you're spending most of what you earn; tight

## What's counted

- **Income** — positive transactions on on-budget accounts
- **Spending** — negative transactions on on-budget accounts
- Transfers between your own accounts are EXCLUDED (they're not
  income or spending — same money, different place)
- One-time-flagged transactions are excluded
- Months with zero income render as null (the line skips that point)

## Average

The big number at the top is the 12-month average rate.
`,
  },
  {
    id: 'dashboard',
    title: 'What is the Dashboard?',
    category: 'getting-started',
    tags: ['dashboard', 'home', 'widgets', 'customize'],
    body: `
The **Dashboard** at \`/dashboard\` is a customizable at-a-glance
view of your finances. Pick which widgets to show and in what
order.

## Default widgets

- Net worth
- Ready to Assign
- This month's cash flow (income / spent / net)
- Health scorecard
- Runway
- Savings rate
- Recent transactions
- Active goals

## Customize

Tap **Customize** at the top. Add new widgets, remove ones you
don't care about, reorder via the up/down arrows. Reset-to-default
if you change your mind.

## Where it lives

Sidebar → Dashboard (top entry). The customization is synced
across your devices via the standard sync.
`,
  },

  // ---------------- v0.6.7 - v0.6.11 articles ----------------------------

  {
    id: 'cloud-folder-sync',
    title: 'How do I sync between my devices? (Recommended path)',
    category: 'sync-privacy',
    tags: ['cloud', 'icloud', 'onedrive', 'dropbox', 'google drive', 'sync', 'folder', 'backup'],
    body: `
Monii Watch can sync between your devices through any folder a
cloud service auto-syncs. **No OAuth, no accounts, nothing to
configure on someone else's server.**

## How it works

You already have a cloud-storage app on your computer (iCloud
Drive on Mac, OneDrive on Windows, Dropbox, Google Drive desktop).
That app keeps a folder on your computer in sync with your
account in the cloud. Monii writes a small encrypted file into
that folder. The cloud service propagates it to your other
devices. The other device reads the file, decrypts it, and
merges with its own copy.

Your data is encrypted **before** it's written. The cloud
service stores the bytes but cannot read them — only your
pairing phrase decrypts them.

## Setup

1. **Set your pairing phrase** under Settings → Sync. Same phrase
   on every device — treat it like a password.
2. **Pick a folder** under Settings → Cloud folder sync.
3. The picker pre-fills with the standard cloud folder for your
   OS (iCloud Drive on Mac, OneDrive on Windows). Accept it or
   navigate to a different cloud-synced folder. The folder needs
   to be one your cloud-storage app already syncs.
4. Click **Pick folder and enable**. Done.

The first sync happens within a few seconds. From then on,
changes push within 5 seconds and incoming changes are picked
up every 30 seconds.

## Per-platform tips

- **macOS**: the standard iCloud folder is
  \`~/Library/Mobile Documents/com~apple~CloudDocs/Monii\`. Visible
  in Finder under "iCloud Drive" in the sidebar.
- **Windows**: OneDrive lives at \`%USERPROFILE%\\OneDrive\\\`. We
  suggest a \`Monii\` subfolder there.
- **Google Drive**: install Google's official **"Drive for
  desktop"** app first — that mounts your Drive as a regular
  folder on your computer. Then point Monii's picker at that
  folder.
- **Linux**: pick whatever your cloud service syncs (Dropbox,
  Nextcloud, ownCloud, etc.).

## Why not just use Google Drive's API directly?

You can — see the "Google Drive" section under Settings → Sync.
That requires creating a Google Cloud project + an OAuth client
ID, which most users don't want to do. The cloud-folder approach
gets the same outcome with one click.

## Changing the folder later

Settings → Cloud folder sync → **Change folder**. Pick a new path;
Monii Watch will:

1. Probe the new folder for write access (catches "not writable"
   errors before flipping the switch).
2. **Move** the existing encrypted snapshot to the new folder
   atomically — the source file is deleted only AFTER the
   destination's bytes match. So a partial transfer never loses
   data.
3. Restart sync against the new folder + force a push.

This is the right flow if you switch from iCloud to OneDrive,
move to a different Dropbox path, etc. — your other devices
auto-pull the new file once the cloud service propagates it.

## Disabling sync

Two options under **Disable**:

- **Disable** (default) — stops the sync loop but **leaves the
  encrypted snapshot in the cloud folder**. Re-enabling later
  picks up where you left off, no data loss.
- **Disable + remove cloud copy** — also deletes the snapshot
  from the cloud folder. Use this for a clean uninstall when
  you don't want any encrypted blob sitting in your cloud
  account.

## Verifying access

The **Verify access** button re-probes the configured folder.
Useful when the cloud-storage app on your computer was paused or
signed out — the verify button tells you immediately whether
the path is still reachable + writable.

## Troubleshooting

If sync seems stuck:
- Check the inline **Sync error** banner in Settings → Cloud
  folder sync. We surface failures (folder removed by another
  app, cloud service signed out, permission denied) right there
  instead of letting them silently disappear.
- Try **Verify access** — re-probes the path.
- Try **Sync now** — force-pushes and pulls.
- Check that the cloud-storage app on your other device is
  signed in and online.
- The cloud app may sync large changes asynchronously — give it
  a minute.
`,
  },

  {
    id: 'trash',
    title: 'I deleted something — how do I get it back?',
    category: 'troubleshooting',
    tags: ['trash', 'restore', 'undelete', 'soft delete', 'recovery'],
    body: `
Deleted accounts, categories, transactions, and scheduled entries
go to **trash** for 30 days before permanent removal. You can
restore any of them with one click.

## Find the trash

- Mobile: More → Recovery & safety → **Trash**
- Desktop: visit \`/trash\` directly, or More → Recovery & safety
  → Trash

## What you'll see

Each entry shows what was deleted, when, and how many days are
left before auto-purge. Click **Restore** to bring it back.

When you restore an account, all its transactions come back too.
When you restore a category, its monthly assignments come back.
When you restore a transaction that was part of a transfer, the
counterpart comes back as well.

## Permanent deletion

Click **Purge** on a single entry to delete it forever right
now. Click **Empty trash** to wipe everything in the trash.

## Edge cases

- Restoring a transaction whose account was permanently deleted
  fails — there's nothing to attach it to.
- Restoring a category whose group was deleted moves it to the
  first available group instead.
- The trash is synced across devices — if you delete on one and
  decide to restore on another, you can.

## Auto-purge

Trash entries older than 30 days are removed on app boot. You
can't recover those.
`,
  },

  {
    id: 'recovery-flow',
    title: 'My data went missing or sync broke — what now?',
    category: 'troubleshooting',
    tags: ['recovery', 'data loss', 'missing', 'recover', 'restore'],
    body: `
Visit \`/recover\` (or More → Recovery & safety → Recovery) for
a step-by-step rescue guide. The page shows your current health
status and walks through possible solutions based on what's wrong.

## Pick the symptom

The page asks "What's wrong?" and offers six categories:

1. **An account is missing** — most likely in the trash.
2. **Transactions are missing** — check the search filter, then
   trash, then your most recent backup.
3. **A balance looks wrong** — try Reconcile on the account.
4. **Sync isn't working** — pairing phrase mismatch or
   network issue.
5. **Everything looks broken** — export current state first,
   then try import-replace.
6. **Wrong workspace open** — switch via the workspaces picker.

Each path has clear next-step buttons.

## Last-resort options

At the bottom of the page:
- Import a backup file
- Pair with another device that has good data via sync
- Export current state (just in case the next step makes it worse)
- Open trash

## Audit log

If you want to know what was changed recently (chat or direct
edits), More → Audit log shows every mutation with timestamps.
`,
  },

  {
    id: 'audit-log',
    title: 'Where can I see what changed in my budget?',
    category: 'advanced',
    tags: ['audit', 'log', 'history', 'changes', 'mutations'],
    body: `
Every recent change to your data is recorded in the **audit log**.
Useful for "wait, when did I rename that category?" or to confirm
the chat panel did what you asked.

## Two sources, one view

- **Direct edits** — you renamed a group, deleted a category,
  imported a CSV.
- **Chat-driven** — every mutation made by the chat panel.

The audit log modal merges both, sorted newest-first. Filter by
source (All / Direct / Chat) or by kind (create / update /
delete / import).

## Where to find it

- Mobile: More → Recovery & safety → **Audit log**
- Desktop: ⌘K → "Audit log"

## Retention

- Direct edits: 500 newest entries (FIFO).
- Chat audit: 200 newest entries.

The log syncs across your devices like the rest of your data,
so you can review on any device.

## What's NOT logged

Read-only operations (opening modals, viewing reports) are not
logged. Only changes to data are.
`,
  },

  {
    id: 'auto-backup',
    title: 'Can the app back up automatically?',
    category: 'sync-privacy',
    tags: ['auto backup', 'automatic', 'json', 'export', 'safety'],
    body: `
Settings → Backup & Import → **Auto-backup** lets you pick a
cadence (off / weekly / every 2 weeks / monthly). On app boot,
if the configured interval has passed since the last auto-backup,
Monii downloads a fresh JSON snapshot to your Downloads folder.

## When it fires

Auto-backup runs **once on app boot** (deferred 1.5 seconds so
the React tree paints first). It will not fire while you're
already using the app.

If you upgrade or restart, the engine checks if a backup is due
and triggers a download if yes.

## What gets exported

The same JSON snapshot as Settings → Backup & Import → Export
JSON. Includes accounts, transactions, categories, settings —
everything synced.

## Backup history

The Settings panel shows the last 5 auto-backup files +
timestamps. The actual files live in your Downloads folder
(wherever your browser saves to).

## Recommendations

- **Weekly** is a sensible default for active budgeters.
- **Monthly** is fine if your budget rarely changes.
- **Off** if you prefer manual exports + Cloud folder sync as
  the safety net.

Auto-backup is independent of every other sync option — it always
saves a local file regardless of what else is configured.
`,
  },

  {
    id: 'share-spending',
    title: 'How do I share a spending summary as an image?',
    category: 'reports',
    tags: ['share', 'image', 'screenshot', 'social', 'png'],
    body: `
Reports → Spending by Category has a **Share image** button that
generates a clean PNG of your top spending categories. The image
is sized for sharing on social media or with a partner.

## Privacy modes

Three options before generating:

- **Detailed** — shows real dollar amounts. Good for sharing
  with a spouse or financial advisor.
- **Percentages only** — shows category proportions but hides
  amounts. Good for social media.
- **Hide amounts (••••)** — category names visible, amounts
  blurred. Good for screenshots that show "what categories I
  track" without revealing how much.

## Where the image goes

- **Mobile** (iOS / Android): triggers the OS share sheet —
  pick where to send.
- **Desktop**: downloads as a PNG to your Downloads folder.

The image is generated entirely on your device using HTML5
Canvas. Nothing is sent to any server.

## What it includes

- Time period title (e.g. "March 2026 spending")
- Total spent (or "••••" in privacy mode)
- Top 7 categories with bars + amounts
- "Monii Watch" footer credit
`,
  },

  {
    id: 'deal-tracker',
    title: 'How do I get notified when something I want goes on sale?',
    category: 'goals',
    tags: ['deal', 'sale', 'tracker', 'wario64', 'slickdeals', 'reddit', 'price'],
    body: `
Set deal-tracker keywords on a goal. Monii Watch scans public
deal feeds for posts matching your keywords AND extracting a
price ≤ what you've saved up. When all three conditions hit,
you get a deal alert.

## Setup

1. **Create a goal** for the item you're saving for.
2. Edit the category → Goal extras → **Deal-tracker keywords**.
3. Type one or more keywords, comma-separated. Be specific —
   "soundbar" matches everything; "Sonos Beam Gen 2" only
   matches what you actually want.
4. Open Settings → Deal feeds and confirm at least one feed is
   enabled. Wario64 (Bluesky) and Slickdeals per-keyword are on
   by default.

## How matching works

For every post in every enabled feed, the matcher checks:

- Does **every** keyword appear in the post text? (Battlefield 6
  PC matches "[PC] Battlefield 6 — \\$39.99 on Steam" but NOT
  "Battlefield 6 launches in 2026" — the second one has no $)
- Can a price be extracted? (No price → no match.)
- Is the price ≤ your envelope balance for this goal? (We don't
  ping you about deals you can't afford yet.)
- Is the price ≤ your goal's target item price (sticker)?

If all conditions match, the deal lands in your **Deal alert
banner** on the Budget + Goals pages.

## What the alert offers

Three buttons per match:

- **Open store** — confirms this is your item AND opens the URL.
- **Hold off · 90d** — pauses every alert for this item for 90
  days. Use this when you're not buying right now and don't want
  to be tempted by other stores running the same sale.
- **Wrong listing** — pauses just this one post (when the feed
  picked up the wrong product).

## Public feeds we read

All reads hit public APIs the same way visiting the website
would — no API keys, no logins, no telemetry.

- **Wario64 (Bluesky)** — fastest signal for video game sales
- **Slickdeals per-keyword** — runs a Slickdeals search RSS for
  each unique keyword across all goals
- **Slickdeals frontpage** — community-curated everything
  (off by default)
- **r/GameDeals**, **r/buildapcsales**, **r/deals**,
  **r/frugalmalefashion**, **r/femalefashionadvice** — Reddit
  RSS feeds (off by default)

## Privacy disclosure

When the Slickdeals per-keyword feed is enabled, your goal
keywords are sent to Slickdeals as part of public search URLs.
This is unavoidable — it's how the search works. To opt out,
disable that feed in Settings.

Nothing else about you (your finances, your other goals, your
device) is ever sent anywhere.

## Throttling

The engine polls feeds every 30 minutes minimum. There's no way
to make it poll faster — be polite to public APIs.
`,
  },

  {
    id: 'goal-auto-deposit',
    title: 'Can a scheduled transfer also fund my envelope?',
    category: 'goals',
    tags: ['scheduled', 'auto deposit', 'goal', 'envelope', 'transfer'],
    body: `
Yes. When you create a scheduled transfer (e.g. "$200 from
Checking to Savings on the 1st of each month"), there's an
**"Also assign to envelope"** dropdown that funds a category at
the same time.

## Why it exists

Without this, scheduled transfers move cash but don't fund the
envelope. You'd have to:
1. Wait for the transfer to materialize
2. Then manually assign the cash to your goal envelope

The auto-deposit field collapses both into one step.

## Setup

1. Scheduled → New → fill in account / payee / category as usual
2. **"Also assign to envelope"** — pick the goal category to
   fund automatically
3. Save

## What happens on each materialization

- The transfer fires (one transaction in each account)
- The target envelope's monthly assignment is bumped by the
  absolute amount
- Both happen atomically — one undo step reverses both

## Edge cases

- The bump is **additive** — never overwrites manual
  assignments. If you've already put $50 into the envelope
  manually and the auto-deposit adds $200, you end up at $250.
- If the target category was deleted, the auto-deposit
  silently skips (the transfer still fires).
- The bump lands in the month of the materialization, not the
  start date. Useful if you've paused + resumed a scheduled
  entry.

## Use cases

- "Move $200 to Savings on the 1st AND fund the Vacation goal"
- "401k contribution drops every paycheck AND mark it on the
  Retirement envelope"
- Automatic monthly funding for any savings goal
`,
  },

  {
    id: 'mobile-tips',
    title: 'Mobile tips: gestures, long-press, swipe',
    category: 'getting-started',
    tags: ['mobile', 'phone', 'gestures', 'long press', 'swipe', 'ios', 'android'],
    body: `
A handful of touch gestures that aren't always obvious:

## Long-press a transaction

Press-and-hold any transaction row (mobile only). After ~500ms
an action sheet slides up from the bottom with quick actions:
mark cleared, flag, edit splits, tag expected refund, find
similar, delete (moves to trash).

This is the touch equivalent of right-click on desktop.

## Swipe to change month

Budget page: swipe left to advance to the next month, swipe
right to go back. iOS Calendar app convention.

## Tap a transaction once to edit

A single tap on a mobile transaction row puts it into edit mode
with the keyboard ready. Tap outside or hit Done to save.

## BottomNav with one thumb

The five primary destinations (Budget, Accounts, Goals, Reports,
More) are all reachable in the bottom tab bar — no need to
reach for the top of the screen.

## Number keys jump tabs

If you're on mobile and a hardware/Bluetooth keyboard is
connected, pressing 1–5 jumps directly to the matching
BottomNav destination (when not editing a field).

## Pinch-to-zoom on receipts

The receipt viewer (tap the paperclip icon on a transaction
with an attached receipt) supports pinch-to-zoom (1× to 5×) +
pan + double-tap-toggle, just like the iOS Photos app.

## Pull down to refresh? No

Monii Watch is local-first; there's nothing to refresh from.
The data on screen is always the latest data on the device.
`,
  },

  {
    id: 'whats-new-modal',
    title: 'The "What\'s new" modal — what is it?',
    category: 'getting-started',
    tags: ['whats new', 'updates', 'release notes', 'changelog'],
    body: `
After Monii Watch updates, you'll see a one-time modal listing
the new features in that release. The modal stays out of your
way after — only fires once per version.

## How it decides when to show

The modal compares the current build version against
\`Settings.lastSeenVersion\`. When they differ, the modal
opens; when you close it, the version is stamped.

- Brand-new users see the welcome tour, not "What's new". The
  tour itself stamps the version on completion.
- Existing users on an old version see "What's new" once after
  upgrading.
- If a release has no user-facing changes, the modal silently
  advances the version without showing.

## Where to find old release notes

The modal has a "View full changelog" link to the GitHub
CHANGELOG.md, which has every release going back to v0.1.

## Disabling it

There's no opt-out — but it only fires once per release, so
the noise is minimal.
`,
  },

  {
    id: 'tip-jar',
    title: 'How can I support the project?',
    category: 'getting-started',
    tags: ['tip jar', 'donate', 'support', 'sponsor', 'free'],
    body: `
Monii Watch is free and always will be. No ads, no tracking, no
upsell. If you'd like to chip in voluntarily, More → Support
the project → **Tip jar** lists a few options.

## How it works

The tip jar opens external payment pages (GitHub Sponsors,
Stripe Payment Link, etc.) in a new tab. Clicking "Open" leaves
the app — your browser handles the payment. The Monii Watch app
itself never sees your payment, your credit card, or your email.

## What the app tracks about tipping

Nothing. The app does NOT remember whether you tipped, doesn't
prompt you to tip again, and doesn't change behavior based on
whether you've supported it. Free users and supporters get the
same experience.

## Why the tip jar exists

Apple's developer fee is \`$99/year\` to keep the app on the App
Store. The tip jar is the project owner's way to cover that cost
without ads or in-app purchases that compromise the privacy
ethos.

If you'd rather not tip, that's completely fine — keep using
the app and tell a friend about it. That's also support.
`,
  },
];

export const HELP_INDEX = HELP_ARTICLES.map((a) => ({
  id: a.id,
  title: a.title,
  category: a.category,
  tags: a.tags,
}));
