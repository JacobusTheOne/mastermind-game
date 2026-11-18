"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIFFICULTIES, type Difficulty } from "@/amplify/functions/game/mastermind";
import type { GameEngine, GuessOutcome, StartInfo } from "@/lib/engine";
import { PEG_COLORS, formatTime } from "@/lib/format";
import { Feedback, Peg } from "./Peg";

interface Row {
  guess: number[];
  black: number;
  white: number;
}

interface GameProps {
  difficulty: Difficulty;
  engine: GameEngine;
  onRequestSignIn: () => void;
  onRankedGameWon: () => void;
}

export function Game({ difficulty, engine, onRequestSignIn, onRankedGameWon }: GameProps) {
  const cfg = DIFFICULTIES[difficulty];
  const [info, setInfo] = useState<StartInfo | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [current, setCurrent] = useState<(number | null)[]>([]);
  const [outcome, setOutcome] = useState<GuessOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  const playing = info !== null && outcome === null;

  // Display timer. The official time for ranked games comes from the server.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(id);
  }, [playing]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await engine.start(difficulty);
      setInfo(started);
      setRows([]);
      setOutcome(null);
      setCurrent(Array(started.pegs).fill(null));
      startedAt.current = Date.now();
      setElapsed(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start game");
    } finally {
      setBusy(false);
    }
  }, [engine, difficulty]);

  const place = useCallback(
    (color: number) => {
      if (!playing || busy || (info && color >= info.colors)) return;
      setCurrent((cur) => {
        const slot = cur.indexOf(null);
        if (slot === -1) return cur;
        const next = [...cur];
        next[slot] = color;
        return next;
      });
    },
    [playing, busy, info],
  );

  const clearSlot = (slot: number) => {
    if (!playing || busy) return;
    setCurrent((cur) => cur.map((c, i) => (i === slot ? null : c)));
  };

  const backspace = useCallback(() => {
    if (!playing || busy) return;
    setCurrent((cur) => {
      const filled = cur.map((c, i) => (c === null ? -1 : i)).filter((i) => i >= 0);
      const last = filled[filled.length - 1];
      if (last === undefined) return cur;
      return cur.map((c, i) => (i === last ? null : c));
    });
  }, [playing, busy]);

  const submit = useCallback(async () => {
    if (!info || !playing || busy || current.includes(null)) return;
    const guess = current as number[];
    setBusy(true);
    setError(null);
    try {
      const result = await engine.guess(info.gameId, guess);
      setRows((r) => [...r, { guess, black: result.black, white: result.white }]);
      setCurrent(Array(info.pegs).fill(null));
      if (result.status !== "PLAYING") {
        setOutcome(result);
        if (result.timeMs !== undefined) setElapsed(result.timeMs);
        if (result.status === "WON" && engine.ranked) onRankedGameWon();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit guess");
    } finally {
      setBusy(false);
    }
  }, [info, playing, busy, current, engine, onRankedGameWon]);

  // Keyboard: 1-8 place a color, Backspace removes, Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[1-8]$/.test(e.key)) place(Number(e.key) - 1);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [place, backspace, submit]);

  const pegs = info?.pegs ?? cfg.pegs;
  const colors = info?.colors ?? cfg.colors;
  const maxGuesses = info?.maxGuesses ?? cfg.maxGuesses;

  return (
    <section className="card game" aria-label="Game board">
      <div className="game-bar">
        <div>
          <strong>{cfg.label}</strong>
          <span className="muted">
            {" "}
            · {pegs} pegs · {colors} colors · {maxGuesses} guesses
            {cfg.allowDuplicates ? " · duplicates" : ""}
          </span>
        </div>
        <div className="timer" aria-live="off">
          ⏱ {formatTime(elapsed)}
        </div>
      </div>

      {!engine.ranked && (
        <p className="notice">
          Practice mode — scores aren&apos;t saved.{" "}
          <button type="button" className="link" onClick={onRequestSignIn}>
            Sign in
          </button>{" "}
          to compete on the leaderboard.
        </p>
      )}

      <div className="secret-row">
        <span className="row-num">Code</span>
        <span className="pegs">
          {Array.from({ length: pegs }, (_, i) => (
            <Peg key={i} color={outcome?.secret?.[i] ?? null} hidden={!outcome?.secret} />
          ))}
        </span>
      </div>

      <ol className="board">
        {Array.from({ length: maxGuesses }, (_, r) => {
          const row = rows[r];
          const isCurrent = playing && r === rows.length;
          return (
            <li key={r} className={`board-row${isCurrent ? " current" : ""}`}>
              <span className="row-num">{r + 1}</span>
              <span className="pegs">
                {Array.from({ length: pegs }, (_, i) =>
                  row ? (
                    <Peg key={i} color={row.guess[i]} />
                  ) : isCurrent ? (
                    <Peg
                      key={i}
                      color={current[i] ?? null}
                      size="lg"
                      onClick={current[i] !== null ? () => clearSlot(i) : undefined}
                      label={current[i] !== null ? `Remove ${PEG_COLORS[current[i]!].name}` : undefined}
                    />
                  ) : (
                    <Peg key={i} color={null} />
                  ),
                )}
              </span>
              {row ? <Feedback black={row.black} white={row.white} pegs={pegs} /> : <span className="feedback-empty" />}
            </li>
          );
        })}
      </ol>

      {playing && (
        <div className="controls">
          <div className="palette" role="group" aria-label="Colors">
            {Array.from({ length: colors }, (_, c) => (
              <Peg key={c} color={c} size="lg" onClick={() => place(c)} label={`${PEG_COLORS[c].name} (key ${c + 1})`} />
            ))}
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={backspace} disabled={busy}>
              ⌫ Undo
            </button>
            <button type="button" onClick={submit} disabled={busy || current.includes(null)}>
              {busy ? "Checking…" : "Submit guess"}
            </button>
          </div>
        </div>
      )}

      {outcome && (
        <div className={`result ${outcome.status === "WON" ? "won" : "lost"}`} role="status">
          {outcome.status === "WON" ? (
            <>
              <strong>Cracked it in {outcome.guessNumber} {outcome.guessNumber === 1 ? "guess" : "guesses"}!</strong>
              <span>
                Time {formatTime(outcome.timeMs ?? elapsed)}
                {engine.ranked && (outcome.personalBest ? " · 🏆 New personal best!" : " · Score saved")}
              </span>
            </>
          ) : (
            <strong>Out of guesses — the code is shown above.</strong>
          )}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!playing && (
        <button type="button" className="start" onClick={start} disabled={busy}>
          {busy ? "Starting…" : outcome ? "Play again" : "Start game"}
        </button>
      )}
      {playing && <p className="hint muted">Tip: keys 1–{colors} pick colors, Backspace undoes, Enter submits.</p>}
    </section>
  );
}
