# Mastermind

[![CI](https://github.com/JacobusTheOne/mastermind-game/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JacobusTheOne/mastermind-game/actions/workflows/ci.yml)

Crack the secret color code in as few guesses as possible, against the clock.

**Play:** https://mastermind-game-789.netlify.app

Next.js frontend on Netlify + AWS Amplify Gen 2 backend (Region **us-east-2**).

## Features

- Three difficulty levels: **Easy** (4 pegs / 6 colors / 10 guesses), **Medium** (5 / 7 / 10),
  **Hard** (6 / 8 / 12, duplicate colors allowed)
- Game timer; leaderboard ranks by **fewest guesses, then fastest time**
- Email + password login (Amazon Cognito) with a public player name (emails are never shown)
- Public top-10 leaderboard per difficulty, plus your personal best
- Guests can play practice games in the browser (not saved)
- Keyboard play (1–8 pick colors, Backspace undo, Enter submit); each color also has a symbol
  for color-blind players

## Architecture

| Piece | Service |
|---|---|
| Frontend | Next.js static export (`out/`) hosted on Netlify |
| Login | Cognito user pool (email + password, `preferred_username` = player name) |
| Game API | AppSync mutations `startGame` / `submitGuess` → Lambda `mastermind-game` |
| In-progress games | DynamoDB `GamesTable` (private, deleted by TTL after 24h) |
| Scores | DynamoDB `Score` model, written only by the Lambda, public read via Cognito identity pool |

**Anti-cheat:** for signed-in players the secret code lives only on the server, every guess is
validated by the Lambda, and time is measured with the server clock. Clients cannot write scores.
Finishing a game and saving its score happen in one DynamoDB transaction (no lost or duplicate
wins), and a conditional write rejects double-submitted guesses.

### Environments

| | Production | Development (sandbox) |
|---|---|---|
| Frontend | Netlify site `mastermind-game-789` | `npm run dev` on localhost |
| Backend | Amplify app `d2xq3zqie15tgt`, branch `main` | `npx ampx sandbox` (per developer) |
| Deployed by | `npm run deploy:backend` (backend), GitHub Actions (frontend) | `npx ampx sandbox` |
| Data | Real players and high scores | Test data only |

Both environments are fully separate (own user pool, API and tables), so testing never touches
real high scores.

## Project layout

```
.github/workflows/ci.yml      PR checks + Netlify deploy
amplify/
  auth/resource.ts            Cognito config
  data/resource.ts            Score model + custom mutations
  functions/game/
    mastermind.ts             Pure game rules (shared with the frontend)
    mastermind.test.ts        Unit tests
    handler.ts                Game Lambda
  backend.ts                  Wiring, GamesTable, IAM grants
app/                          Next.js App Router pages
components/                   Game board, leaderboard, sign-in dialog
lib/                          Amplify client, game engines, formatting
public/_headers               Netlify security headers
scripts/
  deploy-backend.mjs          Production backend deploy (npm run deploy:backend)
  smoke-test.ts               End-to-end test against a deployed backend
```

## Getting started

Prerequisites: Node.js 24+, an AWS CLI profile named `aws-project` for the AWS project
(Region us-east-2), and the GitHub CLI (`gh auth login`) for backend deploys.

```bash
npm install
npx ampx sandbox --profile aws-project   # deploys your personal backend, writes amplify_outputs.json
npm run dev                              # http://localhost:3000
```

`amplify_outputs.json` is generated and gitignored. Locally it must point at **your sandbox**,
never production.

| Script | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Type-check frontend and backend |
| `npm run build` | Static production build into `out/` |
| `npm run sandbox` | Start the sandbox in watch mode |
| `npm run deploy:backend` | Deploy the **production** backend (see below) |

### End-to-end smoke test

Runs against whatever backend `amplify_outputs.json` points at (use the sandbox). Needs two
existing, confirmed test users; it records one Easy score for user A.

```bash
E2E_EMAIL_A=... E2E_EMAIL_B=... E2E_PASSWORD=... npx tsx scripts/smoke-test.ts
```

It checks guest leaderboard access, that guests can't start ranked games, that scores can't be
created by clients, invalid-guess rejection, that one player can't play another's game, a full
win with server time and personal best, and that finished games reject more guesses.

## Making changes

`main` is protected. Every change goes through a pull request:

```bash
git switch -c my-change
# ...edit, commit...
git push -u origin my-change
gh pr create --fill
gh pr checks --watch        # wait for the "test" check
gh pr merge --squash        # only possible once "test" passed
```

Branch protection rules on `main`:

- Pull request required (0 approvals; solo project)
- Required status check **`test`**, and the branch must be up to date with `main`
- Applies to admins too; force pushes and branch deletion are blocked
- Open review conversations must be resolved

## CI/CD

```
pull request ──► "test": install (locked), type-check, unit tests, build ──► required to merge

merge to main ──► "test" ──► "deploy to Netlify"
                             build with production config (AMPLIFY_OUTPUTS)
                             netlify deploy --prod

backend change ──► npm run deploy:backend   (from your machine)
                    ├─ deploys production backend (Amplify app d2xq3zqie15tgt, branch main)
                    ├─ stores its amplify_outputs.json as GitHub variable AMPLIFY_OUTPUTS
                    └─ triggers the workflow to redeploy the site
```

- The `test` job runs with **no AWS or Netlify credentials** and a placeholder Amplify config.
- The `deploy to Netlify` job runs only on `main`, in the `production` GitHub environment, which
  is the only place the Netlify token is available. Deploys never run concurrently.
- Netlify never builds anything itself; it only serves what GitHub Actions uploads.

### Deploying backend changes

Backend changes (anything under `amplify/`) are **not** deployed by CI:

1. Merge the PR (CI checks the code compiles and tests pass).
2. Run `npm run deploy:backend` from an up-to-date `main` checkout.

The script restores your local `amplify_outputs.json` afterwards, so local dev keeps using the
sandbox. Use `npm run deploy:backend -- --no-redeploy` to skip the automatic site redeploy.

> **Order matters:** if frontend code depends on a new backend field or mutation, deploy the
> backend before (or immediately after) merging, or the live site will call an API that doesn't
> exist yet.

**Why not deploy the backend from GitHub Actions?** The AWS project's managed service control
policies deny creating IAM OIDC identity providers (`iam:*Provider*`), so GitHub's keyless AWS
access can't be used. Long-lived AWS access keys are deliberately not stored in GitHub. If the
project later activates advanced AWS features, OIDC can be added and the backend deploy moved
into the workflow.

### Configuration

| Name | Kind | Where | Set by |
|---|---|---|---|
| `AMPLIFY_OUTPUTS` | variable | repository | `npm run deploy:backend` |
| `NETLIFY_SITE_ID` | variable | repository | one-time setup |
| `SITE_URL` | variable | repository | one-time setup |
| `NETLIFY_AUTH_TOKEN` | secret | `production` environment (main only) | one-time setup |

`AMPLIFY_OUTPUTS` is not secret: every value in it ships inside the public JavaScript bundle.

### Rotating the Netlify token

Netlify tokens expire. When the deploy job fails with an authentication error:

1. Netlify → User settings → Applications → Personal access tokens → **New access token**
   (set an expiration), and delete the old one.
2. `gh secret set NETLIFY_AUTH_TOKEN --env production --repo JacobusTheOne/mastermind-game`
   (paste the token when prompted; also update your local `.env` if you keep a copy there).
3. Re-run the failed workflow: `gh run rerun --failed`.

## Troubleshooting

**`npm ci` fails with "Missing: @opentelemetry/core@2.0.0 from lock file".**
Expected. `@aws-amplify/data-construct` and `@aws-amplify/graphql-api-construct` publish incomplete
bundled dependencies, so `npm ci` always rejects the lockfile. CI uses `npm install` and fails if
`package-lock.json` changes, which gives the same reproducibility guarantee.

**CI fails with "package-lock.json is out of date".**
Run `npm install` and commit the lockfile. If it still differs in CI, regenerate it the way CI
installs: clone the repo fresh, run `npm install` (with the lockfile, without `node_modules`), and
commit the resulting `package-lock.json`. Don't delete the lockfile to regenerate it; that drops
the bundled-dependency entries CI adds back.

**Local app shows production data / sign-in uses production accounts.**
Your `amplify_outputs.json` points at production. Regenerate it from your sandbox:
`npx ampx sandbox --once --profile aws-project`.

**Sandbox deploy creates a second stack.**
The sandbox stack name is derived from the `name` in `package.json`; don't rename the package
while a sandbox exists, or delete the old sandbox first.

**Sudden "Access Denied" on AWS calls that used to work.**
Check whether a spend limit has paused the AWS project (AWS Settings → Billing).

## Costs and cleanup

Everything is pay-per-request (Lambda, AppSync, DynamoDB on-demand, Cognito) and costs next to
nothing for a hobby game. Netlify hosting is on the free plan. Cognito's built-in email sender is
limited (about 50 emails/day); switch to Amazon SES before a large public launch.

| To remove | Command |
|---|---|
| Your sandbox backend | `npx ampx sandbox delete --profile aws-project` |
| Production backend | Delete the CloudFormation stack for app `d2xq3zqie15tgt` branch `main`, then the Amplify app |
| Website | Delete the Netlify site `mastermind-game-789` |
