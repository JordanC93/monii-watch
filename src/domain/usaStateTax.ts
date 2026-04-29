/**
 * 2025 US state income tax rates — top marginal rate per state, expressed
 * as a decimal (0.0495 = 4.95%). Used as a flat-rate approximation for the
 * Tax Estimator; adequate for back-of-envelope planning, not for filing.
 *
 * No state income tax: AK, FL, NV, NH (interest/div only), SD, TN, TX, WA, WY.
 *
 * Source: state revenue departments + Tax Foundation 2025 summary. Values
 * may need updating if a state changes brackets — they're easy to maintain
 * here in one place.
 */

export type UsState = {
  code: string;
  name: string;
  /** Top marginal income-tax rate as a decimal. 0 means no state income tax. */
  rate: number;
  /** True for "no state income tax" jurisdictions. Used for messaging. */
  noTax?: boolean;
};

export const US_STATES: UsState[] = [
  { code: 'AL', name: 'Alabama',         rate: 0.05 },
  { code: 'AK', name: 'Alaska',          rate: 0,    noTax: true },
  { code: 'AZ', name: 'Arizona',         rate: 0.025 },
  { code: 'AR', name: 'Arkansas',        rate: 0.039 },
  { code: 'CA', name: 'California',      rate: 0.123 },
  { code: 'CO', name: 'Colorado',        rate: 0.044 },
  { code: 'CT', name: 'Connecticut',     rate: 0.0699 },
  { code: 'DE', name: 'Delaware',        rate: 0.066 },
  { code: 'DC', name: 'District of Columbia', rate: 0.1075 },
  { code: 'FL', name: 'Florida',         rate: 0,    noTax: true },
  { code: 'GA', name: 'Georgia',         rate: 0.0539 },
  { code: 'HI', name: 'Hawaii',          rate: 0.11 },
  { code: 'ID', name: 'Idaho',           rate: 0.058 },
  { code: 'IL', name: 'Illinois',        rate: 0.0495 },
  { code: 'IN', name: 'Indiana',         rate: 0.03 },
  { code: 'IA', name: 'Iowa',            rate: 0.038 },
  { code: 'KS', name: 'Kansas',          rate: 0.0558 },
  { code: 'KY', name: 'Kentucky',        rate: 0.04 },
  { code: 'LA', name: 'Louisiana',       rate: 0.03 },
  { code: 'ME', name: 'Maine',           rate: 0.0715 },
  { code: 'MD', name: 'Maryland',        rate: 0.0575 },
  { code: 'MA', name: 'Massachusetts',   rate: 0.05 },
  { code: 'MI', name: 'Michigan',        rate: 0.0425 },
  { code: 'MN', name: 'Minnesota',       rate: 0.0985 },
  { code: 'MS', name: 'Mississippi',     rate: 0.044 },
  { code: 'MO', name: 'Missouri',        rate: 0.047 },
  { code: 'MT', name: 'Montana',         rate: 0.059 },
  { code: 'NE', name: 'Nebraska',        rate: 0.052 },
  { code: 'NV', name: 'Nevada',          rate: 0,    noTax: true },
  { code: 'NH', name: 'New Hampshire',   rate: 0,    noTax: true },
  { code: 'NJ', name: 'New Jersey',      rate: 0.1075 },
  { code: 'NM', name: 'New Mexico',      rate: 0.059 },
  { code: 'NY', name: 'New York',        rate: 0.109 },
  { code: 'NC', name: 'North Carolina',  rate: 0.0425 },
  { code: 'ND', name: 'North Dakota',    rate: 0.025 },
  { code: 'OH', name: 'Ohio',            rate: 0.035 },
  { code: 'OK', name: 'Oklahoma',        rate: 0.0475 },
  { code: 'OR', name: 'Oregon',          rate: 0.099 },
  { code: 'PA', name: 'Pennsylvania',    rate: 0.0307 },
  { code: 'RI', name: 'Rhode Island',    rate: 0.0599 },
  { code: 'SC', name: 'South Carolina',  rate: 0.062 },
  { code: 'SD', name: 'South Dakota',    rate: 0,    noTax: true },
  { code: 'TN', name: 'Tennessee',       rate: 0,    noTax: true },
  { code: 'TX', name: 'Texas',           rate: 0,    noTax: true },
  { code: 'UT', name: 'Utah',            rate: 0.0455 },
  { code: 'VT', name: 'Vermont',         rate: 0.0875 },
  { code: 'VA', name: 'Virginia',        rate: 0.0575 },
  { code: 'WA', name: 'Washington',      rate: 0,    noTax: true },
  { code: 'WV', name: 'West Virginia',   rate: 0.0482 },
  { code: 'WI', name: 'Wisconsin',       rate: 0.0765 },
  { code: 'WY', name: 'Wyoming',         rate: 0,    noTax: true },
];

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s] as const));
const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s] as const));

export function getStateByCode(code: string | null | undefined): UsState | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function findStateByText(text: string): UsState | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t.length === 2) {
    const byCode = BY_CODE.get(t.toUpperCase());
    if (byCode) return byCode;
  }
  return BY_NAME.get(t) ?? null;
}
