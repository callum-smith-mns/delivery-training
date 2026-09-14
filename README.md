# Delivery Training

Multiplayer delivery simulation game with a React frontend and a Node.js API.

## Project structure

- `.`: frontend app, shared scripts, Playwright tests
- `api/`: standalone Node API workspace with its own dependencies and tests

The repository uses npm workspaces, so running `npm install` at the root installs both frontend and API dependencies.

## Local development

Install dependencies:

```bash
npm install
```

Run frontend and API together:

```bash
npm run dev:full
```

Run only the API:

```bash
npm run dev:api
```

The API stores data in `api/data/teams.json` by default. To keep data outside the
deployment directory, set `DB_PATH` to a persistent file path when starting the
API:

```bash
DB_PATH=/var/lib/delivery-training/teams.json npm run start:api
```

The parent directory is created automatically on first use. An explicit `dbPath`
passed to `createApiApp` takes precedence over `DB_PATH`.

Run only the frontend:

```bash
npm run dev
```

To show the debugging delivery score, set `VITE_SHOW_DELIVERY_SCORE=true` when
building or running the frontend:

```bash
VITE_SHOW_DELIVERY_SCORE=true npm run build
```

## Testing

Frontend unit tests:

```bash
npm run test
```

API tests:

```bash
npm run test:api
```

End-to-end tests:

```bash
npm run test:e2e
```

Live frontend views:

- `/stats`: live team status and statistics
- `/admin`: live team counts and active-session cancellation

Both views show a client-side password prompt. The dummy password is
`TheConductorIsHere`; it is intentionally stored in the frontend JavaScript and
does not provide real security.

## API endpoints

The API is mounted under the configured `BASE_PATH` when one is set:

- `GET /api/health`: health check
- `POST /api/teams`: create a team
- `POST /api/teams/join`: join or rejoin a team
- `GET /api/teams/:teamCode`: fetch a team
- `POST /api/teams/:teamCode/start`: start a game as the host
- `POST /api/teams/:teamCode/load`: load a parcel
- `POST /api/teams/:teamCode/play`: ship a line
- `POST /api/teams/:teamCode/restart`: restart a completed game
- `GET /api/teams/:teamCode/stats`: fetch team statistics
- `GET /api/data`: return the complete stored data set for reporting
- `GET /api/admin/overview`: return team counts and live team details
- `POST /api/admin/teams/:teamCode/cancel`: cancel an active team session
- `GET /report` or `GET /report.html`: serve the reporting page

The admin endpoints currently have no server-side authentication. The browser
password is only a convenience gate for trusted deployments.

`test:e2e` starts a local API and local Vite server through Playwright `webServer` before running tests. This is the same behavior used in CI.

Run everything:

```bash
npm run test:all
```

Close and discard an unfinished game for a team:

```bash
npm --workspace api run close-game -- TEAMCODE
```

The command uses `api/data/teams.json`. Set `DB_PATH` or pass `--db <path>` to target another data file.
