# Rushout

A fast browser-based 2D arcade party game. Run, dodge, pass the pressure, grab power-ups, and survive the countdown in local or online multiplayer arenas.

Two ways to play:

- **Online Rooms** — join/create a room with a 6-character code (up to 13 players), powered by a Colyseus server.
- **Local Same-Device** — 2–4 players on one keyboard, entirely client-side (no network).

## Architecture

```
tag/
├── client/    Vite + React + TypeScript app (menu, lobby, canvas game, HUD)
├── server/    Colyseus server (TagRoom, room lifecycle, authoritative logic)
├── shared/    Types, power-up configs, maps, and the Colyseus room-state schema
└── package.json
```

This is an **npm workspace monorepo**. `shared` is built first and imported by both `client` and `server` so gameplay and power-up logic is never duplicated.

- `client` → deploy to a static host (Vercel, Netlify, Cloudflare Pages).
- `server` → deploy to a long-running Node host with persistent WebSockets (Fly.io, Railway, Render) — **not** serverless/static.

## Prerequisites

- **Node.js 20+**
- **npm 10+**

## Getting Started (Dev Environment)

### 1. Install dependencies

From the repo root:

```bash
npm install
```

### 2. Build the shared package

`shared` must be compiled before the client/server can use it:

```bash
npm run build --workspace=shared
```

Or run the full build (shared + client + server) at any time:

```bash
npm run build
```

### 3. Start the Colyseus server (for online mode)

```bash
npm run dev:server
```

This runs the server in watch mode on **port 2567** (configurable via `--port` or the `PORT` env var). You should see the Colyseus banner and:

```
Rushout server listening on port 2567
```

### 4. Start the client (frontend)

In a **second terminal**:

```bash
npm run dev:client
```

Opens the Vite dev server at **http://localhost:3000**.

> **Note on the local-only flow:** Local multiplayer works entirely in the browser without the server. Only **Create Room / Join Room** (online mode) requires `dev:server` to be running.

## Wiring the Client to the Server

The React client connects to the Colyseus server using the `VITE_COLYSEUS_URL` environment variable. Create a `.env` file in `client/`:

```bash
# client/.env
VITE_COLYSEUS_URL=ws://localhost:2567
```

If unset, the client defaults to `ws://localhost:2567`, so local dev works out of the box.

## Common Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:client` | Start Vite dev server |
| `npm run dev:server` | Start Colyseus server in watch mode on port 2567 |
| `npm run build` | Build shared, then client, then server |
| `npm run build --workspace=shared` | Rebuild the shared package only |
| `npm run build --workspace=client` | Build the frontend only |
| `npm run build --workspace=server` | Build the Colyseus server only |

## Gameplay / Controls

### Online Rooms
- **Create Room** → host configures round length, map, and power-ups, then gets a shareable room code.
- **Join Room** → enter the 6-character code.
- Each player controls their own character on their own device.

### Local Same-Device (key zones)

| Player | Move / Jump |
|--------|-------------|
| Player 1 | `A/D` move, `W` jump |
| Player 2 | `Left/Right` move, `Up` jump |
| Player 3 | `F/H` move, `T` jump |
| Player 4 | `4/6` move, `8` jump |

Power-ups activate automatically when picked up.

### Power-Ups (7 total)

Speed Surge · Freeze Pulse · Ghost Step · Blink Dash · Mirror Decoy · Safe Bubble · Sticky Patch

Pickups spawn on the map in a random rotation. Any player can grab one, and it activates immediately.

## Deployment

- **Client:** build with `npm run build --workspace=client`, then host `client/dist` statically. Set `VITE_COLYSEUS_URL` to your deployed server's WebSocket URL.
- **Server:** build with `npm run build --workspace=server`, then run `npm run start --workspace=server`. If you later run multiple instances, add Redis to sync rooms across instances.
