# Development Guide

Architecture and build/run notes for contributors working in this repository.

## Project Overview

SAP Multi-Target Application (MTA) implementing a multiplayer Tic Tac Toe game using SAPUI5 with a Node.js WebSocket server for real-time gameplay and AI opponent (Monte Carlo Tree Search).

## Build & Run Commands

### Local Development

Two servers must run simultaneously:

1. **WebSocket server** (from `server/`):
   ```bash
   cd server && npm install && npm start
   ```
   Runs on `ws://localhost:8082`

2. **UI server** (from `tic-tac-toe/`):
   ```bash
   cd tic-tac-toe && npm install && npm start
   ```
   Runs UI5 Tooling dev server (`ui5 serve`) on `http://localhost:8081`

### Build & Test

From the `tic-tac-toe/` directory (run `npm install` first):

- **Build**: `npm run build` (`ui5 build --clean-dest` → `dist/`)
- **Lint**: `npm run lint` (`ui5lint`)
- **Tests**: `npm test` (`karma start` with karma-ui5, ChromeHeadless — runs unit + OPA)
- **MTA Build** (from root): `mbt build` (requires SAP MTA Build Tool; the `tic-tac-toe` module builds via `npm ci && npm run build`)

> Build/test toolchain: **UI5 Tooling** (`@ui5/cli`) + **karma-ui5**, replacing the
> deprecated `@sap/grunt-sapui5-bestpractice-*` grunt tasks. UI5 runtime is loaded
> from the CDN (`sapui5.hana.ondemand.com`) at both runtime and test time.

## Architecture

### Project Structure

```
├── server/                          # WebSocket server (standalone)
│   ├── server.js                    # Game server, matchmaking, AI games
│   └── MonteCarloAI.js              # MCTS algorithm (Easy/Medium/Hard)
├── tic-tac-toe/                     # SAPUI5 application
│   └── webapp/
│       ├── view/
│       │   ├── App.view.xml         # Root view (Shell + Router)
│       │   ├── lobby.view.xml       # Matchmaking screen
│       │   └── main.view.xml        # Game board
│       ├── controller/
│       │   ├── lobby.controller.js  # WebSocket connection, invites
│       │   └── main.controller.js   # Game logic, move handling
│       ├── custom/ui/containers/
│       │   └── customControl.js     # Board cell control (X/O rendering)
│       ├── css/style.css
│       └── model/models.js
├── mta_tic-tac-toe_appRouter/       # SAP AppRouter (XSUAA auth)
├── mta_tic-tac-toe_ui_deployer/     # HTML5 repo deployer
└── mta.yaml                         # MTA deployment descriptor
```

### MTA Modules (`mta.yaml`)

- **`mta_tic-tac-toe_appRouter`** — Node.js approuter handling authentication (XSUAA) and routing
- **`mta_tic-tac-toe_ui_deployer`** — Deploys built UI artifacts to HTML5 Application Repository
- **`tic-tac-toe`** — The SAPUI5 application (built via `npm run build` → `dist/`)

Note: The `server/` module is standalone and NOT part of the MTA deployment.

### Backend routing via the AppRouter

The deployed UI must not open `ws://…:8082` directly (mixed content on HTTPS, no
auth). Instead the WebSocket game server is reached through the approuter:

- **`xs-app.json`** route `^/game-server/?(.*)$` → `destination: game-server`
  (`authenticationType: xsuaa`, `csrfProtection: false`). The approuter proxies
  the WebSocket upgrade and enforces XSUAA auth.
- **`mta.yaml`** provisions the `game-server` destination through a managed
  **destination service** (`mta_tic-tac-toe_destination`, bound to the approuter).
  Its `init_data` creates the destination on deploy — set `URL` to where `server/`
  is hosted; `forwardAuthToken: true` passes the JWT to the server, which validates
  it via `server/auth.js` (set `JWT_AUTH_ENABLED=true` on the server in that setup).
- **UI** (`lobby.controller.js` `_getWsUrl`) connects to `wss://<host>/game-server`
  when deployed, and directly to `ws://localhost:8082` in local dev.

### SAPUI5 App

- **Namespace**: `com.tic-tac-toe`
- **Root view**: `App.view.xml` — Shell container with `sap.m.routing.Router`
- **Routing**: `lobby` (default, empty pattern) → `game` (`/game` pattern)
- **Models**: `game` (JSONModel), `lobby` (JSONModel), `device` (JSONModel), `i18n` (ResourceModel)
- **Custom control**: `customControl` — board cell rendering X (`sap-icon://decline`) and O (`sap-icon://circle-task`)
- **Board**: 3x3 `sap.ui.layout.cssgrid.CSSGrid` with 120px cells
- **Min UI5 Version**: 1.136.0 (manifest); runtime pinned to SAPUI5 **1.149.1** on the CDN (`index.html`, `karma.conf.js`)

### WebSocket Server

- **Port**: 8082
- **Protocol**: JSON messages over WebSocket
- **Message types**: `join`, `playAI`, `invite`, `acceptInvite`, `declineInvite`, `move`, `leaveGame`, `refreshList`
- **Server responses**: `joined`, `playerList`, `gameStart`, `moveMade`, `gameOver`, `opponentLeft`, `inviteDeclined`
- **AI**: Monte Carlo Tree Search with configurable difficulty (100/500/2000 iterations)
- **Game validation**: Server-authoritative — validates turns, moves, win/draw detection

### Game Flow

1. Player opens lobby → enters name → clicks Connect (WebSocket)
2. **vs Computer**: Select difficulty → Play → server creates AI game
3. **vs Player**: See online players → Invite → opponent accepts → game starts
4. Moves sent to server → server validates → broadcasts to both players
5. Server detects win/draw → sends `gameOver` → players return to lobby
