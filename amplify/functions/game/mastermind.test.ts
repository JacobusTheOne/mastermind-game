import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES,
  generateSecret,
  rankKey,
  scoreGuess,
  validateGuess,
} from "./mastermind";

describe("scoreGuess", () => {
  it("counts exact matches as black", () => {
    expect(scoreGuess([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ black: 4, white: 0 });
  });

  it("counts misplaced colors as white", () => {
    expect(scoreGuess([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ black: 0, white: 4 });
  });

  it("does not double count duplicates in the guess", () => {
    // Secret has one 0; guess has three 0s, one in the right place.
    expect(scoreGuess([0, 1, 2, 3], [0, 0, 0, 4])).toEqual({ black: 1, white: 0 });
  });

  it("handles duplicates in the secret", () => {
    expect(scoreGuess([1, 1, 2, 2], [2, 2, 1, 1])).toEqual({ black: 0, white: 4 });
    expect(scoreGuess([1, 1, 2, 2], [1, 2, 1, 3])).toEqual({ black: 1, white: 2 });
  });

  it("returns zero for no matches", () => {
    expect(scoreGuess([0, 1, 2, 3], [4, 5, 4, 5])).toEqual({ black: 0, white: 0 });
  });
});

describe("generateSecret", () => {
  const rand = (max: number) => Math.floor(Math.random() * max);

  it("produces unique colors when duplicates are not allowed", () => {
    for (let i = 0; i < 200; i++) {
      const secret = generateSecret(DIFFICULTIES.MEDIUM, rand);
      expect(secret).toHaveLength(5);
      expect(new Set(secret).size).toBe(5);
      secret.forEach((c) => expect(c).toBeLessThan(7));
    }
  });

  it("produces in-range colors for hard mode", () => {
    for (let i = 0; i < 200; i++) {
      const secret = generateSecret(DIFFICULTIES.HARD, rand);
      expect(secret).toHaveLength(6);
      secret.forEach((c) => {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(8);
      });
    }
  });
});

describe("validateGuess", () => {
  it("accepts a valid guess", () => {
    expect(validateGuess(DIFFICULTIES.EASY, [0, 1, 2, 5])).toBeNull();
  });

  it("rejects wrong length, out-of-range and non-integer pegs", () => {
    expect(validateGuess(DIFFICULTIES.EASY, [0, 1, 2])).not.toBeNull();
    expect(validateGuess(DIFFICULTIES.EASY, [0, 1, 2, 6])).not.toBeNull();
    expect(validateGuess(DIFFICULTIES.EASY, [0, 1, 2, 1.5])).not.toBeNull();
    expect(validateGuess(DIFFICULTIES.EASY, "0123")).not.toBeNull();
  });
});

describe("rankKey", () => {
  it("sorts fewer guesses first, then faster times", () => {
    const keys = [rankKey(5, 1000), rankKey(3, 900000), rankKey(3, 45000), rankKey(10, 5)];
    expect([...keys].sort()).toEqual([
      rankKey(3, 45000),
      rankKey(3, 900000),
      rankKey(5, 1000),
      rankKey(10, 5),
    ]);
  });
});
