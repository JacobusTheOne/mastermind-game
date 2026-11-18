import { defineFunction } from "@aws-amplify/backend";

export const game = defineFunction({
  name: "mastermind-game",
  entry: "./handler.ts",
  runtime: 22,
  timeoutSeconds: 10,
  memoryMB: 256,
  // Lives in the data stack: it is an AppSync resolver AND writes to the
  // Score table, so separate stacks would create a circular dependency.
  resourceGroupName: "data",
});
