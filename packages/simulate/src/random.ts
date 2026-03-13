/**
 * @votiverse/simulate — Seeded PRNG
 *
 * Deterministic pseudo-random number generator using the Mulberry32
 * algorithm. Same seed = same sequence of numbers = reproducible
 * simulations.
 */

/**
 * Creates a seeded PRNG using the Mulberry32 algorithm.
 * Returns a function that produces the next random number in [0, 1).
 */
export function createRng(seed: number): Rng {
  let state = seed | 0;
  return {
    /** Returns a random float in [0, 1). */
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    /** Returns a random integer in [min, max] (inclusive). */
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },

    /** Returns true with the given probability (0-1). */
    chance(probability: number): boolean {
      return this.next() < probability;
    },

    /** Picks a random element from an array. */
    pick<T>(array: readonly T[]): T {
      return array[Math.floor(this.next() * array.length)]!;
    },

    /** Shuffles an array in place (Fisher-Yates). Returns the same array. */
    shuffle<T>(array: T[]): T[] {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [array[i], array[j]] = [array[j]!, array[i]!];
      }
      return array;
    },

    /** Returns a value from a weighted distribution. Keys → weights. */
    weighted<K extends string>(distribution: Readonly<Record<K, number>>): K {
      const entries = Object.entries(distribution) as [K, number][];
      const total = entries.reduce((sum, [_, w]) => sum + w, 0);
      let r = this.next() * total;
      for (const [key, weight] of entries) {
        r -= weight;
        if (r <= 0) return key;
      }
      return entries[entries.length - 1]![0];
    },

    /** Returns a normally distributed value (Box-Muller transform). */
    normal(mean: number, stdDev: number): number {
      const u1 = this.next();
      const u2 = this.next();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
      return mean + stdDev * z;
    },
  };
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(array: readonly T[]): T;
  shuffle<T>(array: T[]): T[];
  weighted<K extends string>(distribution: Readonly<Record<K, number>>): K;
  normal(mean: number, stdDev: number): number;
}
