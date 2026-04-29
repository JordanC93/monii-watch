/**
 * Curated vendor → category-keyword map. When a transaction is recorded for
 * a payee with no prior history, we look the vendor up here to suggest a
 * category. Returns a category-name keyword that's then matched fuzzily
 * against the user's actual categories — so the user's category called
 * "Dining Out" or "Restaurants" or "Food" all match the same hint.
 *
 * Not exhaustive on purpose. Better to cover the obvious cases (top US
 * chains by frequency-of-mention) than ship a brittle 5000-entry list.
 */

export type VendorCategoryHint =
  | 'dining'      // restaurants, fast food, pizza, takeout
  | 'coffee'
  | 'groceries'
  | 'gas'
  | 'transit'
  | 'streaming'
  | 'subscriptions'
  | 'shopping'
  | 'clothing'
  | 'home'
  | 'electric'
  | 'gas-utility'
  | 'water'
  | 'internet'
  | 'phone'
  | 'health'
  | 'pharmacy'
  | 'fitness'
  | 'fun'
  | 'travel'
  | 'rideshare'
  // person-to-person — Zelle/Venmo/CashApp send-to-someone. Statement parser
  // tags these so the user can categorize as gift/family/loan/transfer.
  | 'peer-payment'
  // cash withdrawal — ATM debits become cash on hand, often a "Cash" envelope.
  | 'cash'
  // payroll inflow — recognized so the statement parser can pre-fill an
  // income transaction (positive amount, no category = goes to Ready to Assign).
  | 'income';

const RULES: Array<{ pattern: RegExp; hint: VendorCategoryHint }> = [
  // Pizza & fast food
  { pattern: /\b(domino'?s|papa\s*john'?s|pizza\s*hut|little\s*caesars|chuck\s*e\.?\s*cheese)\b/i, hint: 'dining' },
  { pattern: /\b(mcdonald'?s|burger\s*king|wendy'?s|taco\s*bell|kfc|arby'?s|popeyes|chick[\- ]?fil[\- ]?a|five\s*guys|in[\- ]?n[\- ]?out|whataburger|jack\s*in\s*the\s*box)\b/i, hint: 'dining' },
  { pattern: /\b(chipotle|sweetgreen|panera|panda\s*express|qdoba|noodles\s*&?\s*co|cava)\b/i, hint: 'dining' },
  { pattern: /\b(applebee'?s|olive\s*garden|cheesecake\s*factory|outback|red\s*lobster|texas\s*roadhouse|chili'?s|denny'?s|ihop|cracker\s*barrel|tgi[\- ]?friday'?s|ruby\s*tuesday)\b/i, hint: 'dining' },
  { pattern: /\b(subway|jimmy\s*john'?s|jersey\s*mike'?s|firehouse\s*subs|quiznos)\b/i, hint: 'dining' },
  { pattern: /\b(doordash|grubhub|uber\s*eats|postmates|seamless|caviar|instacart\s*food)\b/i, hint: 'dining' },

  // Coffee
  { pattern: /\b(starbucks|dunkin'?(?:\s*donuts)?|peet'?s|caribou|tim\s*hortons|blue\s*bottle|philz)\b/i, hint: 'coffee' },

  // Groceries
  { pattern: /\b(whole\s*foods|trader\s*joe'?s|kroger|safeway|publix|aldi|lidl|wegmans|h[\- ]?e[\- ]?b|giant|stop\s*&?\s*shop|food\s*lion|albertsons|vons|ralphs|sprouts|fresh\s*market|fairway|harris\s*teeter)\b/i, hint: 'groceries' },
  { pattern: /\b(costco|sam'?s\s*club|bj'?s\s*wholesale|walmart\s*(?:grocery|neighborhood)?|target\s*grocery)\b/i, hint: 'groceries' },
  { pattern: /\binstacart\b/i, hint: 'groceries' },

  // Gas
  { pattern: /\b(shell|chevron|exxon(?:mobil)?|bp\b|mobil|valero|sunoco|76\b|arco|conoco|marathon|sinclair|circle\s*k|wawa|sheetz|7[\- ]?eleven|royal\s*dutch\s*shell)\b/i, hint: 'gas' },

  // Rideshare / transit
  { pattern: /\b(uber|lyft|via\b|curb\s*taxi)\b/i, hint: 'rideshare' },
  { pattern: /\b(amtrak|greyhound|metra|mta|bart|caltrain|metro[\- ]?north|nj\s*transit|septa|wmata|cta\b|septa)\b/i, hint: 'transit' },

  // Streaming + subscriptions
  { pattern: /\b(netflix|hulu|disney\s*plus|disney\+|hbo\s*max|max\b|paramount\+|peacock|apple\s*tv|youtube\s*(?:premium|tv)|sling)\b/i, hint: 'streaming' },
  { pattern: /\b(spotify|apple\s*music|tidal|pandora|amazon\s*music|youtube\s*music|sirius\s*xm)\b/i, hint: 'streaming' },
  { pattern: /\b(adobe|dropbox|notion|figma|github|google\s*one|icloud|chatgpt|openai|claude\.ai|anthropic|mailchimp|1password|lastpass)\b/i, hint: 'subscriptions' },
  { pattern: /\b(audible|kindle\s*unlimited|new\s*york\s*times|wsj|wall\s*street\s*journal|washington\s*post|substack|patreon)\b/i, hint: 'subscriptions' },

  // Shopping
  { pattern: /\b(amazon|amzn|ebay|etsy|aliexpress|temu|shein|shopify\s*pay)\b/i, hint: 'shopping' },
  { pattern: /\b(target|walmart|best\s*buy|home\s*depot|lowe'?s|ikea|wayfair|bed\s*bath\s*&?\s*beyond|tj\s*maxx|marshalls|ross\s*dress|ross\s*stores)\b/i, hint: 'shopping' },
  { pattern: /\b(nike|adidas|under\s*armour|lululemon|gap|old\s*navy|banana\s*republic|h&?m|zara|uniqlo|j\.?\s*crew|nordstrom|macy'?s|kohl'?s|jcpenney|saks|bloomingdale'?s)\b/i, hint: 'clothing' },

  // Bills
  { pattern: /\b(verizon|at&?t|t[\- ]?mobile|sprint|xfinity|comcast|spectrum|cox|cricket|mint\s*mobile|google\s*fi|visible)\b/i, hint: 'phone' },
  // Bank-statement abbreviations: NGRID = National Grid, CONED/CECONY = Con Edison,
  // PSEG = Public Service Enterprise Group. These show up in ACH descriptors.
  { pattern: /\b(con\s*ed(?:ison)?|cecony|coned|pg&?e|duke\s*energy|national\s*grid|ngrid\d*|eversource|dominion|xcel|southern\s*california\s*edison|sce\b|dwp\b|laduwp|pseg\b|ppl\s*electric)\b/i, hint: 'electric' },
  { pattern: /\b(comcast\s*internet|spectrum\s*internet|verizon\s*fios|fios|google\s*fiber|att\s*fiber)\b/i, hint: 'internet' },
  // Water utilities (US) — water/sewer authorities show up by abbreviated
  // names on ACH. Hand-picked rather than a wildcard.
  { pattern: /\b(dep\s*water|nyc\s*water\s*board|dwp\s*water|aquaamerica|american\s*water|sjwater|denver\s*water)\b/i, hint: 'water' },
  // Standalone gas utility (separate from the gas-station rule above) — gas
  // bill providers like SoCalGas, NJ Natural Gas, etc.
  { pattern: /\b(socal\s*gas|so\s*cal\s*gas|nj\s*natural\s*gas|peoples\s*gas|national\s*fuel|piedmont\s*natural\s*gas|atmos\s*energy|nicor\s*gas)\b/i, hint: 'gas-utility' },

  // Health
  { pattern: /\b(cvs|walgreens|rite\s*aid|duane\s*reade|costco\s*pharmacy)\b/i, hint: 'pharmacy' },
  { pattern: /\b(quest\s*diagnostics|labcorp|kaiser|blue\s*cross|aetna|cigna|united\s*healthcare|humana|anthem|medicare|copay)\b/i, hint: 'health' },

  // Fitness
  { pattern: /\b(planet\s*fitness|equinox|24\s*hour\s*fitness|la\s*fitness|gold'?s\s*gym|crossfit|orangetheory|f45|peloton|barry'?s|soul\s*cycle)\b/i, hint: 'fitness' },

  // Fun
  { pattern: /\b(amc\b|regal|cinemark|cineplex|imax|fandango|movietickets)\b/i, hint: 'fun' },
  { pattern: /\b(steam(?:powered)?|epic\s*games|playstation|psn|xbox\s*live|nintendo|riot\s*games|blizzard)\b/i, hint: 'fun' },

  // Travel
  { pattern: /\b(airbnb|vrbo|hotels\.com|booking\.com|expedia|priceline|kayak|orbitz)\b/i, hint: 'travel' },
  { pattern: /\b(delta|united|american\s*airlines|jetblue|southwest|alaska\s*airlines|spirit|frontier|allegiant|hawaiian\s*air)\b/i, hint: 'travel' },
  { pattern: /\b(marriott|hilton|hyatt|ihg|holiday\s*inn|hampton|courtyard|residence\s*inn|wyndham|best\s*western|motel\s*6|days\s*inn)\b/i, hint: 'travel' },

  // Person-to-person send (Zelle / Venmo / Cash App). The category is
  // intentionally vague — caller decides if it's a gift/family/loan.
  { pattern: /\b(zelle|venmo|cash\s*app|cashapp|popmoney|google\s*pay\s*send)\b/i, hint: 'peer-payment' },

  // ATM / cash withdrawal. Classified as cash on hand so the user can
  // assign it to a "Cash" envelope or split-track it later.
  { pattern: /\batm\s*(?:withdrawal|cash|debit)?\b|\bcash\s*withdrawal\b/i, hint: 'cash' },

  // Payroll / direct deposit inflows. Recognized so the multi-row statement
  // parser can pre-fill an income transaction (positive amount, no category).
  { pattern: /\b(payroll|direct\s*deposit|trinet|gusto|adp|paychex|paylocity|workday|insperity|justworks|rippling)\b/i, hint: 'income' },
];

/**
 * Look up the best category-keyword hint for a vendor name. Returns null if
 * the vendor isn't in the curated list — caller falls back to "Uncategorized"
 * or asks the user.
 */
export function inferVendorCategoryHint(vendor: string): VendorCategoryHint | null {
  if (!vendor) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(vendor)) return rule.hint;
  }
  return null;
}

/** Map our internal hint → list of category-name keywords to try matching. */
const HINT_KEYWORDS: Record<VendorCategoryHint, string[]> = {
  dining:       ['dining', 'restaurant', 'food', 'eating out', 'takeout', 'meals'],
  coffee:       ['coffee', 'cafe', 'dining', 'food'],
  groceries:    ['grocer', 'groceries', 'food'],
  gas:          ['gas', 'fuel', 'transit', 'transport'],
  transit:      ['transit', 'transport', 'commute'],
  rideshare:    ['rideshare', 'uber', 'transit', 'transport'],
  streaming:    ['stream', 'subscription', 'entertain'],
  subscriptions:['subscription', 'software', 'services'],
  shopping:     ['shopping', 'amazon', 'misc', 'discretionary'],
  clothing:     ['cloth', 'apparel', 'wardrobe'],
  home:         ['home', 'house', 'maintenance'],
  electric:     ['electric', 'power', 'utilit'],
  'gas-utility':['gas', 'utilit', 'natural gas'],
  water:        ['water', 'sewer', 'utilit'],
  internet:     ['internet', 'wifi'],
  phone:        ['phone', 'cell', 'mobile'],
  health:       ['health', 'medical', 'doctor'],
  pharmacy:     ['pharmac', 'medication', 'health'],
  fitness:      ['fitness', 'gym', 'health'],
  fun:          ['fun', 'entertain', 'leisure'],
  travel:       ['travel', 'vacation', 'trip'],
  // Peer payments: try generic "people" first, then gift, then transfer.
  // Most YNAB-like budgets don't have a category for these by default —
  // resolveReceipt will just leave it uncategorized.
  'peer-payment': ['gift', 'family', 'people', 'misc'],
  cash:         ['cash', 'misc', 'discretionary'],
  // Income inflows go to Ready to Assign — `null` category. We still expose
  // a keyword list so a user with an actual "Income" placeholder category
  // gets matched if they want to track inflows that way.
  income:       ['income', 'paycheck', 'salary'],
};

export function keywordsForHint(hint: VendorCategoryHint): string[] {
  return HINT_KEYWORDS[hint] ?? [];
}

// -- Bank-statement description cleaning ---------------------------------

/**
 * Bank ACH descriptors are wrapped in noise: "PAYPAL PURCHASE STARBUCKSSE WEB
 * ID: PAYPALSI77", "ZELLE PAYMENT TO MOM 1234", "POS DEBIT VISA TARGET #4602".
 * Pull the actual merchant out so the brand map can match it.
 *
 * Returns `{ vendor, isPeerPayment }`. `isPeerPayment` is true when the
 * description was a Zelle/Venmo/CashApp send to a person (the recipient is
 * the "vendor" but it's not a merchant).
 */
export function extractInnerVendor(rawDescription: string): { vendor: string; isPeerPayment: boolean } {
  const original = rawDescription.trim();
  if (!original) return { vendor: '', isPeerPayment: false };

  // Strip trailing transaction-network IDs that obscure the real merchant.
  // Examples: "WEB ID: 12345", "PPD ID: ABC", "CCD ID: 99", "ARC ID: 1".
  let s = original.replace(/\b(?:WEB|PPD|CCD|ARC|TEL|TRC|IAT|REF|TRACE)\s*ID[:#]?\s*\S*/gi, ' ');
  // Strip POS / debit-card prefixes ("POS DEBIT VISA", "DEBIT CARD PURCHASE").
  s = s.replace(/\b(?:POS|DEBIT|CREDIT)\s+(?:DEBIT|CREDIT|CARD)?\s*(?:VISA|MASTERCARD|MC|AMEX|DISCOVER)?\s*(?:PURCHASE)?\b/gi, ' ');
  // Strip transaction-channel words.
  s = s.replace(/\b(?:ACH|EFT|WIRE|CHECK\s*CARD|RECURRING)\b/gi, ' ');

  // Zelle / Venmo / CashApp send-to-person → recipient is the vendor.
  // Must run before the PayPal stripper — Zelle uses "TO" wording too.
  // CRITICAL: require an explicit peer-payment indicator (payment / transfer
  // / to / from) so we don't fire on "VENMO BIZ PURCHASE X" which is a
  // merchant wrapper (handled by the platformMatch below). Without this
  // guard we'd extract "Biz" as the recipient.
  const zelleMatch = s.match(/\b(?:zelle|venmo|cash\s*app|cashapp)\s+(?:payment|transfer|to|from)\s*(?:to|from)?\s*([a-z][a-z0-9 .'\-]{1,40}?)(?:\s+(?:on|conf|ref|id|#|\d{4,}|\b)|$)/i);
  if (zelleMatch) {
    const recipient = titleCaseClean(zelleMatch[1]);
    if (recipient) return { vendor: recipient, isPeerPayment: true };
  }

  // PayPal/Square/Stripe wrap a real merchant. "PAYPAL PURCHASE UBER" → Uber.
  // Also handles "PAYPAL *UBER" and "PAYPAL UBER" and "VENMO BIZ X".
  const platformMatch = s.match(/\b(?:paypal|sq\b|square|stripe|venmo\s+biz|venmo\s*\*)\s*(?:purchase|payment|inst\s*xfer|\*)?\s+([a-z][a-z0-9 .'\-]{1,40})/i);
  if (platformMatch) {
    const inner = stripTrailingNoise(platformMatch[1]);
    const titled = titleCaseClean(inner);
    if (titled) return { vendor: normalizeKnownTypos(titled), isPeerPayment: false };
  }

  // ATM withdrawal — keep the literal so the vendor map's `cash` rule fires.
  if (/\batm\s*withdrawal\b|\bcash\s*withdrawal\b/i.test(s)) {
    return { vendor: 'ATM Cash Withdrawal', isPeerPayment: false };
  }

  // Strip any leading transaction descriptors and trailing reference numbers,
  // then title-case what's left.
  let cleaned = s
    .replace(/\bof\s+ny\b/i, '')        // "CON ED OF NY" → "CON ED"
    .replace(/\b\d{6,}\b/g, ' ')        // long ref numbers
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ') // embedded dates
    .replace(/\b\d{8}\b/g, ' ')         // YYYYMMDD style
    .replace(/[#:*]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  cleaned = stripTrailingNoise(cleaned);
  return { vendor: normalizeKnownTypos(titleCaseClean(cleaned)), isPeerPayment: false };
}

/**
 * Normalize bank-statement abbreviations to canonical brand names so the
 * vendor map matches.  Important: we collapse adjacent duplicates after
 * substitution — descriptions often repeat themselves ("CON ED OF NY CECONY"
 * cleans to "Con Ed Cecony" which normalizes to "Con Ed Con Edison" without
 * the dedupe pass; with it, "Con Edison").
 *
 * "STARBUCKSSE" → "STARBUCKS"; "NGRID38" → "National Grid".
 */
function normalizeKnownTypos(s: string): string {
  if (!s) return s;
  let out = s
    .replace(/\bStarbucksse\b/gi, 'Starbucks')
    .replace(/\bStarbuckss\b/gi, 'Starbucks')
    .replace(/\bNgrid\d*\b/gi, 'National Grid')
    .replace(/\bCecony\b/gi, 'Con Edison')
    .replace(/\bConed\b/gi, 'Con Edison');
  // If an alias resolved to the same brand we already have in the string,
  // drop the duplicate fragment. Examples: "Con Ed Con Edison" → "Con Edison",
  // "National Grid Ngrid" → "National Grid".
  out = out
    .replace(/\bCon\s+Ed\b\s+Con\s+Edison\b/gi, 'Con Edison')
    .replace(/\bCon\s+Edison\b\s+Con\s+Ed\b/gi, 'Con Edison')
    .replace(/\bNational\s+Grid\b(\s+National\s+Grid\b)+/gi, 'National Grid');
  // Final pass: collapse identical adjacent words that survived ("Ngrid38 Ngrid38").
  out = out.replace(/\b(\w+)\b(\s+\1\b)+/gi, '$1');
  return out.trim();
}

function stripTrailingNoise(s: string): string {
  return s
    .replace(/\s+\d{2,}$/, '')         // trailing numbers
    .replace(/\s+[A-Z]{2}\s*$/i, '')   // trailing 2-letter state code
    .replace(/[\s.,;:]+$/g, '')
    .trim();
}

function titleCaseClean(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w ? w[0].toUpperCase() + w.slice(1) : w)
    .join(' ');
}
