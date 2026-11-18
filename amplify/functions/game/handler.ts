import { randomInt, randomUUID } from "node:crypto";
import type { AppSyncIdentityCognito, AppSyncResolverEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DIFFICULTIES,
  type Difficulty,
  generateSecret,
  isDifficulty,
  rankKey,
  scoreGuess,
  validateGuess,
} from "./mastermind";

const GAMES_TABLE = requireEnv("GAMES_TABLE");
const SCORE_TABLE = requireEnv("SCORE_TABLE");
const USER_POOL_ID = requireEnv("USER_POOL_ID");

/** Abandoned games are deleted by DynamoDB TTL after this long. */
const GAME_TTL_SECONDS = 24 * 60 * 60;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

interface GameItem {
  gameId: string;
  playerId: string;
  difficulty: Difficulty;
  secret: number[];
  guesses: number;
  status: "PLAYING" | "WON" | "LOST";
  startedAt: number;
  expiresAt: number;
}

type Args = { difficulty?: unknown; gameId?: unknown; guess?: unknown };

/** Works both as an UpdateCommand input and inside a TransactWrite. */
interface GameUpdate {
  TableName: string;
  Key: Record<string, unknown>;
  UpdateExpression: string;
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

// Amplify's function handler puts fieldName at the top level of the event;
// plain AppSync direct Lambda resolvers put it under `info`. Accept both.
type GameEvent = AppSyncResolverEvent<Args> & { fieldName?: string };

export const handler = async (event: GameEvent) => {
  const identity = event.identity as AppSyncIdentityCognito | null;
  if (!identity?.sub) throw new Error("Unauthorized");

  const fieldName = event.fieldName ?? event.info?.fieldName;
  switch (fieldName) {
    case "startGame":
      return startGame(identity.sub, event.arguments.difficulty);
    case "submitGuess":
      return submitGuess(identity, event.arguments.gameId, event.arguments.guess);
    default:
      throw new Error(`Unknown field ${fieldName}`);
  }
};

async function startGame(playerId: string, difficulty: unknown) {
  if (!isDifficulty(difficulty)) throw new Error("Invalid difficulty");
  const cfg = DIFFICULTIES[difficulty];
  const now = Date.now();
  const item: GameItem = {
    gameId: randomUUID(),
    playerId,
    difficulty,
    secret: generateSecret(cfg, (max) => randomInt(max)),
    guesses: 0,
    status: "PLAYING",
    startedAt: now,
    expiresAt: Math.floor(now / 1000) + GAME_TTL_SECONDS,
  };
  await ddb.send(new PutCommand({ TableName: GAMES_TABLE, Item: item }));
  return {
    gameId: item.gameId,
    difficulty,
    pegs: cfg.pegs,
    colors: cfg.colors,
    maxGuesses: cfg.maxGuesses,
    allowDuplicates: cfg.allowDuplicates,
  };
}

async function submitGuess(identity: AppSyncIdentityCognito, gameId: unknown, guess: unknown) {
  if (typeof gameId !== "string") throw new Error("Invalid gameId");

  const { Item } = await ddb.send(new GetCommand({ TableName: GAMES_TABLE, Key: { gameId } }));
  const game = Item as GameItem | undefined;
  // Same error for "missing" and "not yours" so game IDs can't be probed.
  if (!game || game.playerId !== identity.sub) throw new Error("Game not found");
  if (game.status !== "PLAYING") throw new Error("Game is already over");

  const cfg = DIFFICULTIES[game.difficulty];
  const invalid = validateGuess(cfg, guess);
  if (invalid) throw new Error(invalid);

  const now = Date.now();
  const { black, white } = scoreGuess(game.secret, guess as number[]);
  const guessNumber = game.guesses + 1;
  const status = black === cfg.pegs ? "WON" : guessNumber >= cfg.maxGuesses ? "LOST" : "PLAYING";
  const timeMs = now - game.startedAt;

  // Conditional write: rejects double-submits / concurrent requests.
  const advanceGame: GameUpdate = {
    TableName: GAMES_TABLE,
    Key: { gameId },
    UpdateExpression: "SET guesses = :next, #status = :status",
    ConditionExpression: "guesses = :prev AND #status = :playing",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":next": guessNumber,
      ":prev": game.guesses,
      ":status": status,
      ":playing": "PLAYING",
    },
  };

  try {
    if (status === "WON") {
      const personalBest = await recordWin(identity, game.difficulty, guessNumber, timeMs, advanceGame);
      return { black, white, guessNumber, status, secret: game.secret, timeMs, personalBest };
    }
    await ddb.send(new UpdateCommand(advanceGame));
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "ConditionalCheckFailedException" || name === "TransactionCanceledException") {
      throw new Error("Guess already submitted — please refresh");
    }
    throw err;
  }

  if (status === "PLAYING") {
    return { black, white, guessNumber, status };
  }
  return { black, white, guessNumber, status, secret: game.secret, timeMs };
}

/**
 * Atomically marks the game finished AND saves the score (both or neither),
 * so a win can't be lost or recorded twice. Returns true for a personal best.
 */
async function recordWin(
  identity: AppSyncIdentityCognito,
  difficulty: Difficulty,
  guesses: number,
  timeMs: number,
  advanceGame: GameUpdate,
): Promise<boolean> {
  const playerBoard = `${identity.sub}#${difficulty}`;
  const key = rankKey(guesses, timeMs);

  const [previous, playerName] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: SCORE_TABLE,
        IndexName: "byPlayerBoard",
        KeyConditionExpression: "playerBoard = :pb",
        ExpressionAttributeValues: { ":pb": playerBoard },
        ScanIndexForward: true,
        Limit: 1,
      }),
    ),
    getPlayerName(identity.username),
  ]);

  const nowIso = new Date().toISOString();
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Update: advanceGame },
        {
          Put: {
            TableName: SCORE_TABLE,
            Item: {
              id: randomUUID(),
              __typename: "Score",
              difficulty,
              playerId: identity.sub,
              playerName,
              guesses,
              timeMs,
              rankKey: key,
              playerBoard,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          },
        },
      ],
    }),
  );

  const best = previous.Items?.[0]?.rankKey as string | undefined;
  return !best || key < best;
}

async function getPlayerName(username: string): Promise<string> {
  try {
    const user = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
    );
    const name = user.UserAttributes?.find((a) => a.Name === "preferred_username")?.Value;
    if (name?.trim()) return name.trim().slice(0, 24);
  } catch (err) {
    console.error("Could not load player name", err);
  }
  return "Anonymous";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
