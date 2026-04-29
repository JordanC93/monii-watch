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

const numCode = customAlphabet('0123456789', 3);

export function newId(): string {
  return nanoid(16);
}

/** Random three-token room phrase like "amber-falcon-042". User-readable. */
export function newSyncRoom(): string {
  const a = wordsA[Math.floor(Math.random() * wordsA.length)];
  const b = wordsB[Math.floor(Math.random() * wordsB.length)];
  return `${a}-${b}-${numCode()}`;
}
