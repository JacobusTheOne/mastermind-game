#!/usr/bin/env node
/**
 * Deploys the PRODUCTION backend (Cognito, AppSync, Lambda, DynamoDB) from this
 * machine, then publishes the generated amplify_outputs.json to GitHub as the
 * AMPLIFY_OUTPUTS repo variable and re-runs the site deploy so Netlify picks it up.
 *
 * Why from this machine: the AWS project's managed policies block GitHub OIDC
 * federation, and we chose not to store long-lived AWS keys in GitHub.
 *
 * Usage: npm run deploy:backend [-- --no-redeploy]
 * Requires: AWS CLI profile (package.json config.awsProfile) + `gh auth login`.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cfg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).config;
const { amplifyAppId, awsProfile, awsRegion, githubRepo } = cfg;

const env = { ...process.env, AWS_PROFILE: awsProfile, AWS_REGION: awsRegion, CI: "true" };
const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { stdio: "inherit", env, ...opts });
};

run(`npx ampx pipeline-deploy --branch main --app-id ${amplifyAppId}`);

const dir = mkdtempSync(join(tmpdir(), "mastermind-outputs-"));
try {
  run(`npx ampx generate outputs --branch main --app-id ${amplifyAppId} --out-dir "${dir}"`);
  const outputs = readFileSync(join(dir, "amplify_outputs.json"), "utf8");
  const parsed = JSON.parse(outputs);
  if (!parsed.data?.url || !parsed.auth?.user_pool_id) {
    throw new Error("Generated outputs are missing data/auth sections");
  }

  console.log(`\n> gh variable set AMPLIFY_OUTPUTS --repo ${githubRepo}`);
  execSync(`gh variable set AMPLIFY_OUTPUTS --repo ${githubRepo}`, {
    input: JSON.stringify(parsed),
    stdio: ["pipe", "inherit", "inherit"],
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (!process.argv.includes("--no-redeploy")) {
  run(`gh workflow run ci.yml --repo ${githubRepo} --ref main`);
  console.log("\nTriggered the site deploy. Watch it with: gh run watch --repo " + githubRepo);
}
