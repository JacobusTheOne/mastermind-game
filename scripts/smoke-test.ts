/**
 * End-to-end smoke test against a deployed backend (reads amplify_outputs.json).
 *
 * Usage:
 *   E2E_EMAIL_A=... E2E_EMAIL_B=... E2E_PASSWORD=... npx tsx scripts/smoke-test.ts
 * Both users must already exist and be confirmed. Records one EASY score for user A.
 */
import { readFileSync } from "node:fs";
import { Amplify } from "aws-amplify";
import { signIn, signOut } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";
import { DIFFICULTIES, scoreGuess } from "../amplify/functions/game/mastermind";

const outputs = JSON.parse(readFileSync(new URL("../amplify_outputs.json", import.meta.url), "utf8"));
Amplify.configure(outputs);
const client = generateClient<Schema>();

const { E2E_EMAIL_A, E2E_EMAIL_B, E2E_PASSWORD } = process.env;
if (!E2E_EMAIL_A || !E2E_EMAIL_B || !E2E_PASSWORD) throw new Error("Set E2E_EMAIL_A, E2E_EMAIL_B, E2E_PASSWORD");

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function login(email: string) {
  await signOut();
  const res = await signIn({ username: email, password: E2E_PASSWORD! });
  if (res.nextStep.signInStep !== "DONE") throw new Error(`Sign-in step ${res.nextStep.signInStep}`);
}

/** All EASY codes: 4 distinct colors out of 6. */
function allCodes(): number[][] {
  const out: number[][] = [];
  const { pegs, colors } = DIFFICULTIES.EASY;
  const rec = (cur: number[]) => {
    if (cur.length === pegs) return void out.push(cur);
    for (let c = 0; c < colors; c++) if (!cur.includes(c)) rec([...cur, c]);
  };
  rec([]);
  return out;
}

async function main() {
  // 1. Guest reads the leaderboard via identity pool.
  await signOut();
  const guestTop = await client.models.Score.listTopScores(
    { difficulty: "EASY" },
    { sortDirection: "ASC", limit: 10, authMode: "identityPool" },
  );
  check("guest can read leaderboard", !guestTop.errors?.length, guestTop.errors?.[0]?.message);

  // 2. Guest cannot start a ranked game.
  const guestStart = await client.mutations.startGame({ difficulty: "EASY" }, { authMode: "identityPool" });
  check("guest cannot start a ranked game", !!guestStart.errors?.length);

  // 3. Nobody can create scores directly.
  const forged = await (client.models.Score as unknown as { create?: unknown }).create;
  check("Score has no client create mutation", forged === undefined);

  // 4. Player A starts and solves a game.
  await login(E2E_EMAIL_A!);
  const start = await client.mutations.startGame({ difficulty: "EASY" });
  check("player A starts EASY game", !!start.data?.gameId, start.errors?.[0]?.message);
  const gameId = start.data!.gameId;

  const bad = await client.mutations.submitGuess({ gameId, guess: [0, 1, 9] });
  check("invalid guess rejected", !!bad.errors?.length, bad.errors?.[0]?.message);

  // 5. Player B cannot play A's game.
  await login(E2E_EMAIL_B!);
  const hijack = await client.mutations.submitGuess({ gameId, guess: [0, 1, 2, 3] });
  check("player B cannot guess on A's game", hijack.errors?.[0]?.message === "Game not found", hijack.errors?.[0]?.message);

  await login(E2E_EMAIL_A!);
  let candidates = allCodes();
  let last: Schema["GuessResult"]["type"] | null = null;
  while (candidates.length) {
    const guess = candidates[0];
    const res = await client.mutations.submitGuess({ gameId, guess });
    if (res.errors?.length || !res.data) throw new Error(res.errors?.[0]?.message ?? "no data");
    last = res.data;
    if (last.status !== "PLAYING") break;
    candidates = candidates.filter((c) => {
      const fb = scoreGuess(c, guess);
      return fb.black === last!.black && fb.white === last!.white;
    });
  }
  check("player A wins", last?.status === "WON", `${last?.status} in ${last?.guessNumber} guesses`);
  check("secret revealed on game over", last?.secret?.length === 4);
  check("server time recorded", typeof last?.timeMs === "number" && last.timeMs > 0, `${last?.timeMs}ms`);
  check("personalBest flag present", typeof last?.personalBest === "boolean", String(last?.personalBest));

  const after = await client.mutations.submitGuess({ gameId, guess: [0, 1, 2, 3] });
  check("finished game rejects more guesses", !!after.errors?.length, after.errors?.[0]?.message);

  // 6. Score visible on leaderboard with the player name.
  const top = await client.models.Score.listTopScores(
    { difficulty: "EASY" },
    { sortDirection: "ASC", limit: 10, authMode: "identityPool" },
  );
  const mine = top.data.find((s) => s.playerName === "TestPlayerA" && s.timeMs === last?.timeMs);
  check("score appears on leaderboard with player name", !!mine, mine ? `${mine.guesses} guesses` : "");

  await signOut();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
