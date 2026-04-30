/**
 * In-app help center (built v0.6.2). Search-first knowledge base of
 * how the app works, written for a user who has never used a budgeting
 * application before. Articles live in `src/help/articles.ts` so
 * adding new ones is a single-file edit.
 */

// Implementation lands later in this batch — placeholder export so the
// route resolves during the build.
import { HelpCenter } from '../components/Help/HelpCenter';

export function HelpPage() {
  return <HelpCenter />;
}
