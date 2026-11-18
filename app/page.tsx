"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
} from "@/amplify/functions/game/mastermind";
import { Game } from "@/components/Game";
import { Leaderboard } from "@/components/Leaderboard";
import { SignInDialog } from "@/components/SignInDialog";
import { localEngine, serverEngine } from "@/lib/engine";

export default function Home() {
  const { authStatus, user, signOut } = useAuthenticator((ctx) => [ctx.authStatus, ctx.user]);
  const signedIn = authStatus === "authenticated";
  const userId = signedIn ? user?.userId ?? null : null;

  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [signInOpen, setSignInOpen] = useState(false);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!signedIn) {
      setPlayerName(null);
      return;
    }
    fetchUserAttributes()
      .then((attrs) => setPlayerName(attrs.preferred_username ?? attrs.email ?? null))
      .catch(() => setPlayerName(null));
  }, [signedIn, userId]);

  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);
  const refreshScores = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <>
      <header className="site-header">
        <h1>
          <span className="logo" aria-hidden>
            ●■▲◆
          </span>{" "}
          Mastermind
        </h1>
        <div className="account">
          {signedIn ? (
            <>
              <span className="muted">
                Playing as <strong>{playerName ?? "…"}</strong>
              </span>
              <button type="button" className="secondary" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" onClick={openSignIn} disabled={authStatus === "configuring"}>
              Sign in / Sign up
            </button>
          )}
        </div>
      </header>

      <main>
        <nav className="difficulty-tabs" aria-label="Difficulty">
          {DIFFICULTY_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              className={d === difficulty ? "tab active" : "tab"}
              aria-pressed={d === difficulty}
              onClick={() => setDifficulty(d)}
            >
              {DIFFICULTIES[d].label}
            </button>
          ))}
        </nav>

        <div className="layout">
          <Game
            // Remount (reset) when the difficulty or sign-in state changes.
            key={`${difficulty}-${signedIn}`}
            difficulty={difficulty}
            engine={signedIn ? serverEngine : localEngine}
            onRequestSignIn={openSignIn}
            onRankedGameWon={refreshScores}
          />
          <div className="side">
            <Leaderboard difficulty={difficulty} userId={userId} refreshKey={refreshKey} />
            <details className="card rules">
              <summary>How to play</summary>
              <ul>
                <li>The computer hides a secret code of colored pegs.</li>
                <li>Fill a row and submit your guess.</li>
                <li>
                  <span className="key key-black inline" /> = right color, right spot.{" "}
                  <span className="key key-white inline" /> = right color, wrong spot.
                </li>
                <li>Crack the code before you run out of guesses. The timer starts with the game.</li>
                <li>Hard mode allows the same color more than once.</li>
              </ul>
            </details>
          </div>
        </div>
      </main>

      <SignInDialog open={signInOpen} onClose={closeSignIn} />
    </>
  );
}
