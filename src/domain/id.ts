import { customAlphabet, nanoid } from 'nanoid';

const wordsA = [
  'amber', 'azure', 'brave', 'bright', 'calm', 'clever', 'cosmic', 'crisp',
  'deep', 'eager', 'electric', 'fair', 'fine', 'fresh', 'gentle', 'glad',
  'happy', 'jolly', 'kind', 'lucky', 'mellow', 'merry', 'noble', 'orange',
  'pure', 'quick', 'quiet', 'rapid', 'silver', 'sleek', 'soft', 'solar',
  'spry', 'steady', 'stellar', 'sunny', 'swift', 'tame', 'true', 'vivid',
  'warm', 'wise', 'witty', 'zesty',
];
const wordsB = [
  'badger', 'beacon', 'breeze', 'canyon', 'cedar', 'comet', 'coral', 'crane',
  'delta', 'echo', 'ember', 'falcon', 'forest', 'galaxy', 'glacier', 'harbor',
  'heron', 'horizon', 'island', 'jade', 'lake', 'lantern', 'lily', 'meadow',
  'mesa', 'moss', 'mountain', 'nebula', 'oak', 'ocean', 'orbit', 'otter',
  'pebble', 'peak', 'pine', 'plateau', 'prairie', 'quartz', 'reef', 'ridge',
  'river', 'sage', 'sapling', 'shore', 'sky', 'sparrow', 'stone', 'stream',
  'summit', 'thicket', 'tide', 'topaz', 'tundra', 'valley', 'willow',
];
// Pool extension for phrase entropy (v0.7.31). Common, unambiguous,
// easy-to-type English words; no homophone pairs, nothing offensive.
const wordsC = [
  'acorn', 'alpine', 'anchor', 'apple', 'apricot', 'arrow', 'aspen', 'atlas',
  'aurora', 'autumn', 'bamboo', 'basil', 'beach', 'berry', 'birch', 'bison',
  'blossom', 'bluff', 'bobcat', 'boulder', 'bramble', 'brass', 'bronze',
  'brook', 'cabin', 'cactus', 'candle', 'canoe', 'caramel', 'cardinal',
  'carrot', 'cascade', 'castle', 'cherry', 'chestnut', 'cinnamon', 'citrus',
  'cliff', 'clover', 'cobalt', 'cocoa', 'condor', 'copper', 'cottage',
  'cotton', 'cove', 'coyote', 'cricket', 'crimson', 'crystal', 'cypress',
  'daisy', 'dawn', 'denim', 'desert', 'dolphin', 'dove', 'dune', 'dusk',
  'eagle', 'elm', 'feather', 'fern', 'fig', 'finch', 'fjord', 'flame',
  'flint', 'fox', 'garnet', 'geyser', 'ginger', 'glen', 'gold', 'granite',
  'grape', 'grove', 'gull', 'harvest', 'hawk', 'hazel', 'hill', 'holly',
  'honey', 'ivory', 'ivy', 'juniper', 'kelp', 'lagoon', 'laurel', 'lava',
  'lemon', 'lichen', 'linen', 'lotus', 'lynx', 'magnet', 'mango', 'maple',
  'marble', 'marigold', 'marsh', 'melon', 'mint', 'mist', 'moose', 'nectar',
  'nimbus', 'north', 'nutmeg', 'olive', 'onyx', 'opal', 'orchard', 'orchid',
  'oriole', 'osprey', 'palm', 'peach', 'pearl', 'pelican', 'penguin', 'peony',
  'pepper', 'petal', 'pigeon', 'plume', 'pond', 'poppy', 'prism', 'pumpkin',
  'rain', 'raven', 'redwood', 'robin', 'rose', 'rowan', 'ruby', 'saffron',
  'salmon', 'sand', 'satin', 'seal', 'sequoia', 'shadow', 'shell', 'sierra',
  'slate', 'snow', 'spruce', 'spring', 'starling', 'storm', 'sunset', 'swan',
  'teak', 'thunder', 'timber', 'toffee', 'trail', 'trout', 'tulip', 'vanilla',
  'velvet', 'violet', 'walnut', 'wave', 'wheat', 'winter', 'wolf', 'wren',
  'zinc',
];

/** Combined phrase-word pool. Exported for tests. */
export const PHRASE_WORDS: readonly string[] = [...wordsA, ...wordsB, ...wordsC];

const numCode = customAlphabet('0123456789', 4);

export function newId(): string {
  return nanoid(16);
}

/** Uniform random index in [0, bound) from crypto.getRandomValues,
 *  with rejection sampling to avoid modulo bias. */
function secureIndex(bound: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / bound) * bound;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % bound;
  }
}

/**
 * Random pairing phrase like "amber-falcon-cocoa-ridge-4172".
 *
 * This phrase is the sync-room secret AND (per Iron Rule #14) the
 * encryption key for the Drive / personal-server snapshot transports,
 * so its entropy is a security parameter, not a UX nicety.
 *
 * Entropy: 4 words from a ~270-word pool + a 4-digit code
 * ≈ 4·log2(270) + log2(10000) ≈ 45 bits, drawn from
 * crypto.getRandomValues (nanoid's customAlphabet is also CSPRNG-backed).
 * Against the Argon2id KDF (~50-100 ms/guess) that is thousands of
 * CPU-years for an offline attack on a stolen snapshot. The previous
 * format (3 tokens from small lists via Math.random) was ~21 bits —
 * about 3 CPU-days.
 *
 * Existing phrases keep working; this only affects newly generated ones.
 */
export function newSyncRoom(): string {
  const pick = () => PHRASE_WORDS[secureIndex(PHRASE_WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${pick()}-${numCode()}`;
}
