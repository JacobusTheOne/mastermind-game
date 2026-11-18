import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { game } from "../functions/game/resource";

const schema = a.schema({
  Difficulty: a.enum(["EASY", "MEDIUM", "HARD"]),

  /**
   * Completed winning games. Written ONLY by the game Lambda (direct
   * DynamoDB access), never by clients, so scores cannot be forged.
   * Anyone (guest or signed in) can read via the Cognito identity pool.
   */
  Score: a
    .model({
      difficulty: a.string().required(),
      playerId: a.string().required(),
      playerName: a.string().required(),
      guesses: a.integer().required(),
      timeMs: a.integer().required(),
      /** "<guesses>#<timeMs>" zero-padded; sorts best-first. */
      rankKey: a.string().required(),
      /** "<playerId>#<difficulty>" for personal-best lookups. */
      playerBoard: a.string().required(),
    })
    .secondaryIndexes((index) => [
      index("difficulty").sortKeys(["rankKey"]).name("byDifficulty").queryField("listTopScores"),
      index("playerBoard").sortKeys(["rankKey"]).name("byPlayerBoard").queryField("listPlayerScores"),
    ])
    .disableOperations(["mutations", "subscriptions"])
    .authorization((allow) => [
      allow.guest().to(["read"]),
      allow.authenticated("identityPool").to(["read"]),
    ]),

  GameStart: a.customType({
    gameId: a.id().required(),
    difficulty: a.string().required(),
    pegs: a.integer().required(),
    colors: a.integer().required(),
    maxGuesses: a.integer().required(),
    allowDuplicates: a.boolean().required(),
  }),

  GuessResult: a.customType({
    black: a.integer().required(),
    white: a.integer().required(),
    guessNumber: a.integer().required(),
    /** PLAYING | WON | LOST */
    status: a.string().required(),
    /** Revealed only once the game is over. */
    secret: a.integer().array(),
    /** Server-measured duration, set once the game is over. */
    timeMs: a.integer(),
    personalBest: a.boolean(),
  }),

  startGame: a
    .mutation()
    .arguments({ difficulty: a.ref("Difficulty").required() })
    .returns(a.ref("GameStart"))
    .handler(a.handler.function(game))
    .authorization((allow) => [allow.authenticated()]),

  submitGuess: a
    .mutation()
    .arguments({
      gameId: a.id().required(),
      guess: a.integer().required().array().required(),
    })
    .returns(a.ref("GuessResult"))
    .handler(a.handler.function(game))
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Signed-in players call the game mutations with their user pool token;
    // the leaderboard is read with IAM (identityPool) so guests can see it.
    defaultAuthorizationMode: "userPool",
  },
});
