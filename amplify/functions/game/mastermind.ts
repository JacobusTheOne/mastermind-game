/**
 * Pure Mastermind rules, shared by the game Lambda (authoritative for
 * signed-in players) and the browser (local practice games for guests).
 * No AWS or DOM dependencies so it can run anywhere and be unit tested.
 */

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface DifficultyConfig {
  label: string;
  pegs: number;
  colors: number;
  maxGuesses: number;
  allowDuplicates: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  EASY: { label: "Easy", pegs: 4, colors: 6, maxGuesses: 10, allowDuplicates: false },
  MEDIUM: { label: "Medium", pegs: 5, colors: 7, maxGuesses: 10, allowDuplicates: false },
  HARD: { label: "Hard", pegs: 6, colors: 8, maxGuesses: 12, allowDuplicates: true },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && value in DIFFICULTIES;
}

/** Returns a uniformly random integer in [0, max). */
export type RandomInt = (max: number) => number;

export function generateSecret(cfg: DifficultyConfig, randomInt: RandomInt): number[] {
  if (cfg.allowDuplicates) {
    return Array.from({ length: cfg.pegs }, () => randomInt(cfg.colors));
  }
  // Fisher-Yates shuffle of all colors, then take the first `pegs`.
  const pool = Array.from({ length: cfg.colors }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, cfg.pegs);
}

/** Returns an error message, or null when the guess is valid for the config. */
export function validateGuess(cfg: DifficultyConfig, guess: unknown): string | null {
  if (!Array.isArray(guess) || guess.length !== cfg.pegs) {
    return `Guess must contain exactly ${cfg.pegs} pegs`;
  }
  for (const peg of guess) {
    if (!Number.isInteger(peg) || peg < 0 || peg >= cfg.colors) {
      return `Each peg must be a color between 0 and ${cfg.colors - 1}`;
    }
  }
  return null;
}

export interface Feedback {
  /** Right color in the right position. */
  black: number;
  /** Right color in the wrong position. */
  white: number;
}

export function scoreGuess(secret: number[], guess: number[]): Feedback {
  let black = 0;
  const secretCounts = new Map<number, number>();
  const guessCounts = new Map<number, number>();
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      black++;
    } else {
      secretCounts.set(secret[i], (secretCounts.get(secret[i]) ?? 0) + 1);
      guessCounts.set(guess[i], (guessCounts.get(guess[i]) ?? 0) + 1);
    }
  }
  let white = 0;
  for (const [color, count] of guessCounts) {
    white += Math.min(count, secretCounts.get(color) ?? 0);
  }
  return { black, white };
}

/**
 * Sortable key: fewer guesses first, then faster time.
 * e.g. 5 guesses in 83.2s -> "05#0000083200"
 */
export function rankKey(guesses: number, timeMs: number): string {
  return `${String(guesses).padStart(2, "0")}#${String(timeMs).padStart(10, "0")}`;
}
