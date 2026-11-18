"use client";

import { useEffect, useState } from "react";
import type { Schema } from "@/amplify/data/resource";
import { DIFFICULTIES, type Difficulty } from "@/amplify/functions/game/mastermind";
import { client } from "@/lib/amplify";
import { formatTime } from "@/lib/format";

type Score = Pick<Schema["Score"]["type"], "id" | "playerName" | "guesses" | "timeMs" | "createdAt">;

const FIELDS = ["id", "playerName", "guesses", "timeMs", "createdAt"] as const;

interface LeaderboardProps {
  difficulty: Difficulty;
  userId: string | null;
  refreshKey: number;
}

export function Leaderboard({ difficulty, userId, refreshKey }: LeaderboardProps) {
  const [scores, setScores] = useState<Score[] | null>(null);
  const [best, setBest] = useState<Score | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // identityPool auth works for guests and signed-in players alike.
    const top = client.models.Score.listTopScores(
      { difficulty },
      { sortDirection: "ASC", limit: 10, authMode: "identityPool", selectionSet: FIELDS },
    );
    const mine = userId
      ? client.models.Score.listPlayerScores(
          { playerBoard: `${userId}#${difficulty}` },
          { sortDirection: "ASC", limit: 1, authMode: "identityPool", selectionSet: FIELDS },
        )
      : Promise.resolve(null);

    Promise.all([top, mine])
      .then(([topRes, mineRes]) => {
        if (cancelled) return;
        if (topRes.errors?.length) throw new Error(topRes.errors[0].message);
        setScores(topRes.data);
        setBest(mineRes?.data?.[0] ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load scores");
      });
    return () => {
      cancelled = true;
    };
  }, [difficulty, userId, refreshKey]);

  return (
    <section className="card leaderboard" aria-label="Leaderboard">
      <h2>🏆 Top 10 · {DIFFICULTIES[difficulty].label}</h2>
      <p className="muted small">Fewest guesses wins; time breaks ties.</p>

      {error && <p className="error">{error}</p>}
      {!error && scores === null && <p className="muted">Loading…</p>}
      {scores?.length === 0 && <p className="muted">No scores yet — be the first!</p>}

      {scores && scores.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Guesses</th>
              <th className="num">Time</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s, i) => (
              <tr key={s.id} className={best?.id === s.id ? "me" : undefined}>
                <td>{i + 1}</td>
                <td className="player">{s.playerName}</td>
                <td className="num">{s.guesses}</td>
                <td className="num">{formatTime(s.timeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {userId && (
        <div className="personal">
          <span className="muted">Your best:</span>{" "}
          {best ? (
            <strong>
              {best.guesses} guesses · {formatTime(best.timeMs)}
            </strong>
          ) : (
            <span className="muted">no wins yet</span>
          )}
        </div>
      )}
    </section>
  );
}
