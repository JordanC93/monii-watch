/**
 * English message dictionary. Add new strings here and reference via `t('key')`.
 * Keys are dot-notated: `domain.subdomain.action`. Variables wrap in `{name}`.
 *
 * Right now this file is intentionally sparse — most existing strings are
 * still inline. New code should add their strings here so a future
 * translation pass is a contained job.
 */

const messages: Record<string, string> = {
  // Generic UI verbs
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.confirm': 'Confirm',
  'common.next': 'Next',
  'common.back': 'Back',
  'common.skip': 'Skip',
  'common.apply': 'Apply',
  'common.reset': 'Reset',

  // Toast templates
  'toast.copied': 'Copied to clipboard',
  'toast.savedItems': 'Saved {count} item{plural}',
  'toast.refundReceived': 'Refund marked received',

  // Budget
  'budget.readyToAssign': 'Ready to Assign',
  'budget.assigned': 'Assigned',
  'budget.activity': 'Activity',
  'budget.available': 'Available',

  // Modal titles
  'modal.expectedRefund.title': 'Expecting a refund?',
  'modal.iouEntry.add': 'Add IOU',
  'modal.iouEntry.edit': 'Edit IOU',
  'modal.goalCelebration.title': 'Goal reached!',
  'modal.quarterlyReview.title': 'Quarterly review',
};

export default messages;
