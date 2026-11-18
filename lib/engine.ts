"use client";

import { client } from "./amplify";
import {
  DIFFICULTIES,
  type Difficulty,
  generateSecret,
  scoreGuess,
  validateGuess,
} from "@/amplify/functions/game/mastermind";

export type GameStatus = "PLAYING" | "WON" | "LOST";

export interface StartInfo {
  gameId: string;
  pegs: number;
  colors: number;
  maxGuesses: number;
  allowDuplicates: boolean;
}

export interface GuessOutcome {
  black: number;
  white: number;
  guessNumber: number;
  status: GameStatus;
  secret?: number[];
  timeMs?: number;
  personalBest?: boolean;
}

export interface GameEngine {
  /** Ranked games are validated and timed by the server and saved. */
  ranked: boolean;
  start(difficulty: Difficulty): Promise<StartInfo>;
  guess(gameId: string, guess: number[]): Promise<GuessOutcome>;
}

function firstError(errors: readonly { message: string }[] | undefined, fallback: string) {
  return new Error(errors?.[0]?.message ?? fallback);
}

/** Signed-in players: the Lambda holds the secret and measures time. */
export const serverEngine: GameEngine = {
  ranked: true,
  async start(difficulty) {
    const { data, errors } = await client.mutations.startGame({ difficulty });
    if (errors?.length || !data) throw firstError(errors, "Could not start game");
    return data;
  },
  async guess(gameId, guess) {
    const { data, errors } = await client.mutations.submitGuess({ gameId, guess });
    if (errors?.length || !data) throw firstError(errors, "Could not submit guess");
    return {
      black: data.black,
      white: data.white,
      guessNumber: data.guessNumber,
      status: data.status as GameStatus,
      secret: data.secret?.filter((n): n is number => n !== null) ?? undefined,
      timeMs: data.timeMs ?? undefined,
      personalBest: data.personalBest ?? undefined,
    };
  },
};

/** Guests: practice games that run entirely in the browser (not saved). */
function createLocalEngine(): GameEngine {
  const games = new Map<
    string,
    { difficulty: Difficulty; secret: number[]; guesses: number; startedAt: number }
  >();
  const randomInt = (max: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  };

  return {
    ranked: false,
    async start(difficulty) {
      const cfg = DIFFICULTIES[difficulty];
      const gameId = crypto.randomUUID();
      games.set(gameId, {
        difficulty,
        secret: generateSecret(cfg, randomInt),
        guesses: 0,
        startedAt: Date.now(),
      });
      return { gameId, ...cfg };
    },
    async guess(gameId, guess) {
      const game = games.get(gameId);
      if (!game) throw new Error("Game not found");
      const cfg = DIFFICULTIES[game.difficulty];
      const invalid = validateGuess(cfg, guess);
      if (invalid) throw new Error(invalid);
      const { black, white } = scoreGuess(game.secret, guess);
      game.guesses += 1;
      const status: GameStatus =
        black === cfg.pegs ? "WON" : game.guesses >= cfg.maxGuesses ? "LOST" : "PLAYING";
      if (status === "PLAYING") return { black, white, guessNumber: game.guesses, status };
      games.delete(gameId);
      return {
        black,
        white,
        guessNumber: game.guesses,
        status,
        secret: game.secret,
        timeMs: Date.now() - game.startedAt,
      };
    },
  };
}

export const localEngine = createLocalEngine();
