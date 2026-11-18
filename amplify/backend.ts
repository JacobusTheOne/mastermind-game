import { defineBackend } from "@aws-amplify/backend";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { game } from "./functions/game/resource";

const backend = defineBackend({ auth, data, game });

const gameLambda = backend.game.resources.lambda;
const scoreTable = backend.data.resources.tables["Score"];
const userPool = backend.auth.resources.userPool;

// Private table holding in-progress games (incl. the secret code).
// Not exposed through AppSync; only the game Lambda can touch it.
const gamesTable = new Table(Stack.of(gameLambda), "GamesTable", {
  partitionKey: { name: "gameId", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: RemovalPolicy.DESTROY,
});

gamesTable.grantReadWriteData(gameLambda);
scoreTable.grantReadWriteData(gameLambda);
// The Amplify table grant does not cover secondary indexes (personal-best lookup).
gameLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["dynamodb:Query"],
    resources: [`${scoreTable.tableArn}/index/*`],
  }),
);
gameLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["cognito-idp:AdminGetUser"],
    resources: [userPool.userPoolArn],
  }),
);

backend.game.addEnvironment("GAMES_TABLE", gamesTable.tableName);
backend.game.addEnvironment("SCORE_TABLE", scoreTable.tableName);
backend.game.addEnvironment("USER_POOL_ID", userPool.userPoolId);
