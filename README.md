# Mastermind

Crack the secret color code in as few guesses as possible, against the clock.
Next.js frontend + AWS Amplify Gen 2 backend (Region **us-east-2**).

## Features

- Three difficulty levels: **Easy** (4 pegs / 6 colors / 10 guesses), **Medium** (5 / 7 / 10),
  **Hard** (6 / 8 / 12, duplicate colors allowed)
- Game timer; leaderboard ranks by **fewest guesses, then fastest time**
- Email + password login (Amazon Cognito) with a public player name
- Public top-10 leaderboard per difficulty, plus your personal best
- Guests can play practice games (not saved)

## Architecture

| Piece | Service |
|---|---|
| Frontend | Next.js static export (`out/`) on Netlify |
| Login | Cognito user pool (email + password, `preferred_username` = player name) |
| Game API | AppSync mutations `startGame` / `submitGuess` → Lambda `mastermind-game` |
| In-progress games | DynamoDB `GamesTable` (private, 24h TTL) |
| Scores | DynamoDB `Score` model — written only by the Lambda, public read via identity pool |

**Anti-cheat:** for signed-in players the secret code lives only on the server, every guess is
validated by the Lambda, and the time is measured with the server clock. Clients cannot write
scores directly.

## Project layout

```
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
```

## Local development

```bash
npm install
npx ampx sandbox --profile aws-project   # deploys your personal backend, writes amplify_outputs.json
npm run dev                              # http://localhost:3000
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build` (writes `out/`).

To delete the sandbox backend: `npx ampx sandbox delete --profile aws-project`.

## CI/CD

```
PR ──► GitHub Actions "test" (type-check, unit tests, build) ──► required to merge
merge to main ──► "test" ──► "deploy to Netlify" (build with production config)

backend change ──► npm run deploy:backend (from your machine)
                   ├─ deploys production backend (Amplify app d2xq3zqie15tgt, branch main, us-east-2)
                   ├─ stores amplify_outputs.json as GitHub variable AMPLIFY_OUTPUTS
                   └─ re-runs the site deploy
```

- `main` is protected: changes go through a pull request and the `test` check must pass.
- PR checks run without any AWS or Netlify credentials.
- The backend is deployed from your machine because the AWS project's managed policies block
  GitHub OIDC federation, and long-lived AWS keys are deliberately not stored in GitHub.
  **Deploy backend changes before merging frontend code that depends on them.**

GitHub configuration:

| Name | Kind | Where |
|---|---|---|
| `AMPLIFY_OUTPUTS` | variable | repo (set by `npm run deploy:backend`) |
| `NETLIFY_SITE_ID`, `SITE_URL` | variable | repo |
| `NETLIFY_AUTH_TOKEN` | secret | `production` environment (main branch only) |
