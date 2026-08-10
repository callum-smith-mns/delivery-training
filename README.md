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

Run only the frontend:

```bash
npm run dev
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

`test:e2e` starts a local API and local Vite server through Playwright `webServer` before running tests. This is the same behavior used in CI.

Run everything:

```bash
npm run test:all
```
