/**
 * Conversation framework — pure types and contracts.
 *
 * The chat panel is a thin frontend over the existing repo CRUD. Intents are
 * the declarative bridge: each one matches a phrase, extracts arguments via
 * regex named groups, and calls into `db/repo.ts`. No NLP, no external API —
 * everything runs locally and deterministically.
 *
 * Adding a new intent means writing one file in `intents/`, registering it in
 * `intents/index.ts`, and (optionally) adding a hint chip to ChatPanel.
 */

import type { Money } from '../domain/types';

/** A user-typed turn or an assistant-generated response, in the chat thread. */
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** Wall-clock ms when added to the thread. */
  at: number;
  /** If the assistant performed a mutation, what changed (for undo / display). */
  effect?: ChatEffect;
};

/** Side effect produced by an intent handler — used for confirmations + undo. */
export type ChatEffect =
  | { kind: 'created-transaction'; transactionId: string; amount: Money; vendor?: string }
  | { kind: 'set-setting'; field: string; value: unknown }
  | { kind: 'set-assignment'; month: string; categoryId: string; amount: Money }
  | { kind: 'covered-overspending'; moved: Money; categoriesAffected: number }
  | { kind: 'created-scheduled'; scheduledId: string }
  | { kind: 'paused-scheduled'; scheduledId: string; paused: boolean }
  | { kind: 'lookup'; subject: string; value: string };

/** Outcome of running an intent — text the assistant says back, plus optional effect. */
export type IntentResult = {
  reply: string;
  effect?: ChatEffect;
  /** True when the intent matched but couldn't act (missing info). */
  needsClarification?: boolean;
  /**
   * Quick-reply options the chat should render as tap-able chips. The
   * `value` becomes the next user input (so it flows through the same
   * resolver path). When present without `pending`, this is just hint
   * suggestions; when paired with `pending`, the next user message resumes
   * the paused intent with the chosen value.
   */
  quickReplies?: Array<{ label: string; value: string }>;
  /**
   * If set, the chat puts itself in a "waiting on clarification" state.
   * The next user message (or quick-reply chip click) is passed to
   * `resume()` instead of running through the regex matcher again.
   */
  pending?: PendingFollowUp;
};

/**
 * Suspended-intent state. Lives in the ChatPanel until the user answers
 * (by clicking a chip or typing a reply). Carries everything needed to
 * complete the original action.
 */
export type PendingFollowUp = {
  /** Short identifier for debugging / logs. */
  kind: string;
  /** What the assistant is waiting for, in plain English. Shown above the input. */
  prompt: string;
  /**
   * Resume the pending intent with the user's reply. Returns a new
   * IntentResult — could be a final result OR another follow-up if the
   * user's answer wasn't conclusive.
   */
  resume: (reply: string, ctx: IntentContext) => IntentResult;
};

/**
 * An Intent is the unit of recognition + execution.
 *
 * `match` returns extracted args (or null); `run` executes them. Splitting the
 * two lets the registry try every intent in priority order and report a
 * helpful "didn't understand" message when nothing matches.
 */
export type Intent<Args = unknown> = {
  name: string;
  /** Natural-language examples shown in /help and as hint chips. */
  examples: string[];
  /** Higher = tried first. Use to disambiguate overlapping patterns. */
  priority: number;
  /** Returns extracted args when the input matches, null otherwise. */
  match(input: string): Args | null;
  /** Executes the intent given the args. Pure boundary — calls into repo here. */
  run(args: Args, ctx: IntentContext): IntentResult;
};

/**
 * Read-only handles the intent uses to look up data + the current month for
 * assignment-related intents. Passed in fresh each turn so handlers stay
 * stateless.
 */
export type IntentContext = {
  selectedMonth: string;
  /** Current local-time today as ISO yyyy-mm-dd. */
  today: string;
  /** Format cents in the active currency — used for human-readable replies. */
  formatMoney: (cents: Money) => string;
};
