# EBK — NBA Draft Game

EBK is a real-time NBA draft-and-compete game. Two players draft rosters from the full NBA player database, then their teams compete head-to-head across a series of statistical categories (games played, PPG, RPG, APG). First to win the required number of games takes the series.

---

## Running locally

### Prerequisites

- Node.js 20+
- npm 9+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

Required vars (see `.env.example` for full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma connection string — use `file:./dev.db` for local SQLite |
| `JWT_SECRET` | Long random string used to sign session tokens |
| `APP_URL` | Public URL of the app, e.g. `http://localhost:3000` — used for Socket.IO CORS and email links |
| `NEXT_PUBLIC_BASE_URL` | Same base URL, read by the Next.js sitemap/robots.txt (defaults to `https://ebkgame.com`) |

### 3. Push the database schema and seed player data

```bash
npm run db:push
npm run db:seed
```

### 4. Start the development server

```bash
npm run dev
```

The app runs at `http://localhost:3000`. The server is a custom Express + Socket.IO server (`server.ts`) — do not use `next dev`.

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the development server (Next.js + Socket.IO via `ts-node`) |
| `npm run build` | Full production build: push schema → generate Prisma client → patch/scrape player data → Next.js build → **compile `server.ts` → `dist/server.js`** |
| `npm run build:server` | Compile `server.ts` to `dist/server.js` only (TypeScript → `tsconfig.server.json`) |
| `npm start` | Start the production server (`node dist/server.js`) — requires `npm run build` first |
| `npm test` | Run the unit test suite (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run type-check` | TypeScript type-check without emitting files |
| `npm run lint` | ESLint via `next lint` |
| `npm run db:push` | Push Prisma schema to the database |
| `npm run db:seed` | Seed the database with historical player stats |
| `npm run scrape` | Scrape Basketball Reference for current-season data |

---

## Deploying to Railway

EBK is configured for Railway via `railway.toml` using a Docker build.

1. Create a Railway project and link this repo.
2. Add a PostgreSQL plugin (or any Postgres provider) and copy the connection string.
3. Set the following environment variables in the Railway service settings:

```
DATABASE_URL=<your-postgres-connection-string>
JWT_SECRET=<long-random-secret>
APP_URL=https://<your-railway-domain>
NEXT_PUBLIC_BASE_URL=https://<your-railway-domain>
NODE_ENV=production
PORT=3000
```

4. Deploy — Railway will run the Dockerfile, which:
   - Installs dependencies
   - Generates the Prisma client
   - Builds the Next.js app
   - Compiles `server.ts`
   - On start: pushes the schema, kicks off a background scrape, and launches the server

### Optional env vars

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) for transactional email (preferred over SMTP in production). Leave blank to fall back to SMTP or console logging. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `FROM_EMAIL` | SMTP credentials for transactional email (password reset, etc.). Alternative to Resend. Leave blank to use console logging in development. |
| `DEV_SECRET` | Dev-only bypass for `/api/auth/dev-verify`. Never set in production. |
| `NOCOOLDOWN_USER_IDS` | Comma-separated user IDs that bypass the 30-min rematch cooldown (for automated testing). |

---

## Tech stack

- **Next.js 14** (App Router) — frontend and API routes
- **Socket.IO 4** — real-time game state (draft picks, results, chat)
- **Prisma 5 + SQLite / PostgreSQL** — ORM; SQLite locally, Postgres in production
- **Tailwind CSS 3** — styling
- **TypeScript 5** — end-to-end type safety
- **vitest** — unit test runner

---

## Project structure

```
server.ts          — Express + Socket.IO server (game engine)
src/
  app/             — Next.js App Router pages and API routes
    api/auth/      — Auth endpoints (login, register, password reset, me)
    game/          — Game page ([code] dynamic route) and profile
    auction/       — Auction game mode
    lobby/         — Matchmaking lobby
    leaderboard/   — Global leaderboard
  lib/             — Shared utilities (accessories, auth helpers)
  types/
    game.ts        — Shared types and pure game logic (getRequiredPositions, etc.)
prisma/
  schema.prisma    — Database schema
  seed.ts          — Player data seed script
scripts/           — Scraping and data-patching scripts
__tests__/         — Unit tests
```
