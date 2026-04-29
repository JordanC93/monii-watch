/**
 * Curated icon catalog for budget categories. Lucide picks were chosen
 * to map cleanly onto the most common envelope-budget categories without
 * trying to cover every possible label — better to give 36 great choices
 * than 200 mediocre ones.
 *
 * Lucide's icon style (thin strokes, round caps) closely tracks SF Symbols
 * Regular weight; the glass-theme CSS in `globals.css` further thins them
 * to 1.5 px stroke + round joins so they read as native macOS icons inside
 * the glass panels.
 *
 * Rendered through `<CategoryIcon name="...">` in `components/ui/CategoryIcon.tsx`.
 * Adding a new icon: append to ICON_CATALOG below; nothing else changes.
 */

import {
  Home, Zap, Wifi, Phone, Fuel, Bus, Train, Bike, Car,
  ShoppingCart, ShoppingBag, Utensils, Coffee, Pizza, Beer, IceCream,
  Tv, Music, Gamepad2, Film, Book, GraduationCap,
  HeartPulse, Pill, Stethoscope, Shield,
  PiggyBank, Target, Sparkles, TrendingUp, LineChart, Banknote,
  Plane, Palmtree, MapPin,
  Dog, Cat, Baby, Dumbbell, Briefcase, Building2,
  Gift, HeartHandshake, CreditCard, Receipt, Tag, Layers,
  Hammer, Wrench, Scissors, Shirt, Wine, Smartphone,
  type LucideIcon,
} from 'lucide-react';

export type IconCatalogEntry = {
  /** Stable identifier persisted in `Category.icon`. Kebab-case. */
  id: string;
  /** Human-readable label shown in the picker tooltip. */
  label: string;
  Icon: LucideIcon;
};

export const ICON_CATALOG: IconCatalogEntry[] = [
  // Bills & home
  { id: 'home',          label: 'Home',           Icon: Home },
  { id: 'zap',           label: 'Electric',       Icon: Zap },
  { id: 'wifi',          label: 'Internet',       Icon: Wifi },
  { id: 'phone',         label: 'Phone',          Icon: Phone },
  { id: 'smartphone',    label: 'Mobile',         Icon: Smartphone },
  { id: 'fuel',          label: 'Gas',            Icon: Fuel },
  { id: 'shield',        label: 'Insurance',      Icon: Shield },

  // Transit
  { id: 'car',           label: 'Car',            Icon: Car },
  { id: 'bus',           label: 'Bus',            Icon: Bus },
  { id: 'train',         label: 'Train',          Icon: Train },
  { id: 'bike',          label: 'Bike',           Icon: Bike },

  // Food & dining
  { id: 'shopping-cart', label: 'Groceries',      Icon: ShoppingCart },
  { id: 'utensils',      label: 'Dining',         Icon: Utensils },
  { id: 'coffee',        label: 'Coffee',         Icon: Coffee },
  { id: 'pizza',         label: 'Takeout',        Icon: Pizza },
  { id: 'beer',          label: 'Drinks',         Icon: Beer },
  { id: 'wine',          label: 'Wine',           Icon: Wine },
  { id: 'ice-cream',     label: 'Treats',         Icon: IceCream },

  // Entertainment
  { id: 'tv',            label: 'Streaming',      Icon: Tv },
  { id: 'music',         label: 'Music',          Icon: Music },
  { id: 'gamepad',       label: 'Games',          Icon: Gamepad2 },
  { id: 'film',          label: 'Movies',         Icon: Film },
  { id: 'book',          label: 'Books',          Icon: Book },

  // Health
  { id: 'heart-pulse',   label: 'Health',         Icon: HeartPulse },
  { id: 'pill',          label: 'Medications',    Icon: Pill },
  { id: 'stethoscope',   label: 'Doctor',         Icon: Stethoscope },

  // Shopping & lifestyle
  { id: 'shopping-bag',  label: 'Shopping',       Icon: ShoppingBag },
  { id: 'shirt',         label: 'Clothing',       Icon: Shirt },
  { id: 'scissors',      label: 'Personal care',  Icon: Scissors },
  { id: 'gift',          label: 'Gifts',          Icon: Gift },
  { id: 'heart-handshake', label: 'Charity',      Icon: HeartHandshake },

  // Pets & family
  { id: 'dog',           label: 'Pets · dog',     Icon: Dog },
  { id: 'cat',           label: 'Pets · cat',     Icon: Cat },
  { id: 'baby',          label: 'Kids',           Icon: Baby },

  // Work & education
  { id: 'briefcase',     label: 'Work',           Icon: Briefcase },
  { id: 'building',      label: 'Office',         Icon: Building2 },
  { id: 'graduation-cap', label: 'Education',     Icon: GraduationCap },
  { id: 'dumbbell',      label: 'Fitness',        Icon: Dumbbell },

  // Goals & savings
  { id: 'piggy-bank',    label: 'Savings',        Icon: PiggyBank },
  { id: 'target',        label: 'Goal',           Icon: Target },
  { id: 'sparkles',      label: 'Wishlist',       Icon: Sparkles },
  { id: 'trending-up',   label: 'Investing',      Icon: TrendingUp },
  { id: 'line-chart',    label: 'Markets',        Icon: LineChart },
  { id: 'banknote',      label: 'Cash',           Icon: Banknote },

  // Travel
  { id: 'plane',         label: 'Travel',         Icon: Plane },
  { id: 'palm-tree',     label: 'Vacation',       Icon: Palmtree },
  { id: 'map-pin',       label: 'Trips',          Icon: MapPin },

  // Misc
  { id: 'credit-card',   label: 'Credit card',    Icon: CreditCard },
  { id: 'receipt',       label: 'Receipts',       Icon: Receipt },
  { id: 'hammer',        label: 'Repairs',        Icon: Hammer },
  { id: 'wrench',        label: 'Maintenance',    Icon: Wrench },
  { id: 'tag',           label: 'Other',          Icon: Tag },
  { id: 'layers',        label: 'Misc',           Icon: Layers },
];

/** Lookup index for fast render — built once at module load. */
const BY_ID = new Map(ICON_CATALOG.map((e) => [e.id, e] as const));

export function getCategoryIcon(name: string | null | undefined): IconCatalogEntry | null {
  if (!name) return null;
  return BY_ID.get(name) ?? null;
}

/**
 * Best-effort migration helper: given a legacy emoji + category name, suggest
 * an icon id. Used when the user opens the Edit modal — they see a
 * pre-selected suggestion rather than blank state.
 */
export function suggestIconForLegacy(emoji: string | null | undefined, name: string): string | null {
  const e = (emoji || '').trim();
  const n = name.toLowerCase();
  // Most direct: known emoji → icon
  const emojiMap: Record<string, string> = {
    '🏠': 'home',     '🏡': 'home',
    '⚡': 'zap',      '💡': 'zap',
    '🌐': 'wifi',     '📡': 'wifi',
    '📱': 'smartphone', '☎️': 'phone',
    '🛒': 'shopping-cart', '🛍️': 'shopping-bag',
    '⛽': 'fuel',
    '🛡️': 'shield', '🛡': 'shield',
    '🍔': 'utensils', '🍕': 'pizza', '🍴': 'utensils', '🥗': 'utensils',
    '☕': 'coffee', '🍺': 'beer', '🍷': 'wine', '🍦': 'ice-cream',
    '📺': 'tv', '🎬': 'film', '🎵': 'music', '🎶': 'music', '🎮': 'gamepad', '📚': 'book',
    '💊': 'pill', '🩺': 'stethoscope', '❤️': 'heart-pulse',
    '👕': 'shirt', '✂️': 'scissors',
    '🎉': 'sparkles', '🎁': 'gift', '🤝': 'heart-handshake',
    '🐶': 'dog', '🐱': 'cat', '👶': 'baby',
    '💼': 'briefcase', '🏢': 'building', '🎓': 'graduation-cap', '🏋️': 'dumbbell', '🏋': 'dumbbell',
    '🐷': 'piggy-bank', '🎯': 'target', '✨': 'sparkles', '📈': 'trending-up', '📊': 'line-chart', '💵': 'banknote', '💰': 'piggy-bank',
    '✈️': 'plane', '🌴': 'palm-tree', '📍': 'map-pin',
    '💳': 'credit-card', '🧾': 'receipt',
    '🔨': 'hammer', '🔧': 'wrench',
    '🚨': 'shield',
    '🚗': 'car', '🚌': 'bus', '🚆': 'train', '🚲': 'bike',
  };
  if (e && emojiMap[e]) return emojiMap[e];
  // Then a name keyword scan as a fallback
  const keywordRules: Array<[RegExp, string]> = [
    [/rent|mortgage|housing|home/, 'home'],
    [/electric|power|energy/, 'zap'],
    [/internet|wifi|broadband/, 'wifi'],
    [/phone|cell|mobile/, 'smartphone'],
    [/gas|fuel|petrol/, 'fuel'],
    [/grocer|market/, 'shopping-cart'],
    [/dining|restaurant|takeout|fast food/, 'utensils'],
    [/coffee|cafe/, 'coffee'],
    [/subscription|stream|netflix|hulu|disney/, 'tv'],
    [/insurance/, 'shield'],
    [/savings|emergency/, 'piggy-bank'],
    [/vacation|holiday/, 'palm-tree'],
    [/travel|trip|flight/, 'plane'],
    [/credit\s*card/, 'credit-card'],
    [/health|doctor|medical/, 'heart-pulse'],
    [/medication|pharmacy/, 'pill'],
    [/clothing|apparel|wardrobe/, 'shirt'],
    [/gift/, 'gift'],
    [/pet|dog/, 'dog'],
    [/cat\b/, 'cat'],
    [/kid|child|baby/, 'baby'],
    [/work|office|salary/, 'briefcase'],
    [/educat|school|tuition|college/, 'graduation-cap'],
    [/gym|fitness|workout/, 'dumbbell'],
    [/charit|donation/, 'heart-handshake'],
    [/invest|brokerage|stock/, 'trending-up'],
    [/cash/, 'banknote'],
    [/transit|transport|bus|train|uber|lyft|rideshare/, 'bus'],
    [/car\b|auto/, 'car'],
    [/bike|cycling/, 'bike'],
  ];
  for (const [re, id] of keywordRules) if (re.test(n)) return id;
  return null;
}
