# Tic Tac Toe — SAP MTA + WebSocket Multiplayer

A multiplayer Tic Tac Toe game built with SAPUI5, featuring real-time online play via WebSocket and an AI opponent powered by Monte Carlo Tree Search.

**Contents:** [Features](#features) · [Quick Start](#quick-start) · [Development](#development) · [Architecture](#architecture) · [Project Structure](#project-structure) · [Tech Stack](#tech-stack) · [Deploy to SAP BTP](#deploy-to-sap-btp)

## Features

- **Multiplayer** — real-time play against other players via WebSocket, with a lobby showing online players and game invitations
- **AI opponent** — server-side Monte Carlo Tree Search with three difficulty levels (Easy, Medium, Hard)
- **Robust connection handling** — automatic reconnection with exponential backoff, 10-minute inactivity timeout to prevent hanging games
- **SAP MTA** — deployable to SAP BTP via the HTML5 Application Repository

## Quick Start

### Prerequisites

- Node.js 20+ (Node 22+ is required for the SAP AppRouter module when deploying to BTP)
- npm

### Run locally

The app needs two servers running side by side:

**1. WebSocket server** (multiplayer + AI) — listens on `ws://localhost:8082`

```bash
cd server
npm install
npm start
```

**2. UI server** (SAPUI5 app via UI5 Tooling) — listens on `http://localhost:8081`

```bash
cd tic-tac-toe
npm install
npm start
```

Then open **http://localhost:8081** in your browser.

### How to play

- **vs Computer** — select a difficulty (Easy / Medium / Hard) and click *Play*
- **vs Player** — enter your name, click *Connect*, then invite an online player. To test locally, open a second browser window.

## Development

All commands run from `tic-tac-toe/` (after `npm install`):

| Command | What it does |
|---------|--------------|
| `npm run build` | `ui5 build` → `dist/` |
| `npm test` | karma + karma-ui5 (unit + OPA, ChromeHeadless) |
| `npm run lint` | ui5lint |

The build/test toolchain uses **UI5 Tooling** (`@ui5/cli`) with **karma-ui5**; the UI5 runtime is loaded from the CDN at both runtime and test time.

More details (architecture notes, backend routing setup): [DEVELOPMENT.md](DEVELOPMENT.md).

## Architecture

```mermaid
graph TB
    subgraph Browser["Browser (SAPUI5)"]
        LobbyView["Lobby View<br/>Connect / Play vs Computer / Online Players"]
        GameView["Game View<br/>3x3 CSSGrid Board / Turn Indicator"]
        LobbyView -->|"navigate"| GameView
        GameView -->|"leave"| LobbyView
    end

    subgraph Server["WebSocket Server (:8082)"]
        Players["Players Registry<br/>id → {name, ws, status}"]
        Games["Games Manager<br/>id → {board[], turn, players}"]
        AI["Monte Carlo AI<br/>MCTS Algorithm"]
        Games -->|"AI game"| AI
    end

    subgraph BTP["SAP BTP (Cloud Deployment)"]
        AppRouter["AppRouter<br/>(Node.js)"]
        HTML5Repo["HTML5 App<br/>Repository"]
        XSUAA["XSUAA<br/>(OAuth 2.0)"]
        AppRouter --> HTML5Repo
        AppRouter --> XSUAA
    end

    Browser <-->|"WebSocket (JSON)<br/>join, move, invite, playAI"| Server

    style Browser fill:#e8f4fd,stroke:#1a73e8
    style Server fill:#fce8e6,stroke:#d93025
    style BTP fill:#e6f4ea,stroke:#1e8e3e
```

<details>
<summary><b>WebSocket protocol — Player vs Player</b></summary>

```mermaid
sequenceDiagram
    participant A as Player A
    participant S as Server
    participant B as Player B

    A->>S: join {name}
    S->>A: joined {id}
    S->>A: playerList
    S->>B: playerList

    A->>S: invite {targetId}
    S->>B: invite {fromName}
    B->>S: acceptInvite {fromId}
    S->>A: gameStart {symbol: O}
    S->>B: gameStart {symbol: X}

    A->>S: move {index}
    S->>A: moveMade {O, idx}
    S->>B: moveMade {O, idx}

    B->>S: move {index}
    S->>A: moveMade {X, idx}
    S->>B: moveMade {X, idx}

    S->>A: gameOver {win}
    S->>B: gameOver {win}
```

</details>

<details>
<summary><b>WebSocket protocol — Player vs AI</b></summary>

```mermaid
sequenceDiagram
    participant P as Player
    participant S as Server
    participant AI as Monte Carlo AI

    P->>S: playAI {difficulty: hard}
    S->>P: gameStart {symbol: O}

    P->>S: move {index}
    S->>P: moveMade {O, idx}
    S->>AI: findBestMove(board)
    AI->>S: bestMove
    S->>P: moveMade {X, idx}

    P->>S: move {index}
    S->>P: moveMade {O, idx}
    S->>P: gameOver {draw}
```

</details>

### AI: Monte Carlo Tree Search

The AI runs a classic MCTS loop on the server:

```mermaid
graph LR
    A["Selection<br/>UCB1 tree traversal"] --> B["Expansion<br/>Add untried child"]
    B --> C["Simulation<br/>Random playout"]
    C --> D["Backpropagation<br/>Update win/visit counts"]
    D --> A

    style A fill:#fff3e0,stroke:#e65100
    style B fill:#e8f5e9,stroke:#2e7d32
    style C fill:#e3f2fd,stroke:#1565c0
    style D fill:#fce4ec,stroke:#c62828
```

Difficulty is controlled by the number of MCTS iterations per move, with built-in variance to make the AI less predictable:

| Level | MCTS iterations | Behavior |
|-------|-----------------|----------|
| Easy | 50–150 | Makes frequent mistakes |
| Medium | 400–600 | Plays reasonably well |
| Hard | 1800–2200 | Near-optimal play |

## Project Structure

```
├── server/                     # Node.js WebSocket server
│   ├── server.js               # Game server, matchmaking, AI integration
│   └── MonteCarloAI.js         # Monte Carlo Tree Search algorithm
├── tic-tac-toe/                # SAPUI5 frontend application
│   └── webapp/
│       ├── view/               # XML views (App, lobby, game)
│       ├── controller/         # Controllers (lobby, game logic)
│       ├── custom/             # Custom board cell control
│       └── css/                # Styling
├── mta_tic-tac-toe_appRouter/  # SAP AppRouter (auth)
├── mta_tic-tac-toe_ui_deployer/# HTML5 repo deployer
└── mta.yaml                    # MTA deployment descriptor
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SAPUI5 1.149.1 (pinned CDN; manifest minUI5Version 1.136), XML Views, CSSGrid |
| Backend | Node.js, WebSocket (ws) |
| AI | Monte Carlo Tree Search (MCTS) |
| Auth | SAP XSUAA |
| Deploy | SAP MTA, HTML5 App Repository |

## Deploy to SAP BTP

```bash
# Install MTA Build Tool
npm install -g mbt

# Build MTA archive
mbt build

# Deploy (requires CF CLI + SAP BTP access)
cf deploy mta_archives/mta_tic-tac-toe_0.0.1.mtar
```

> **Note:** The WebSocket server (`server/`) is not part of the MTA deployment and must be hosted separately. When deployed, the UI reaches it through the AppRouter `/game-server` route (see [DEVELOPMENT.md](DEVELOPMENT.md) → *Backend routing via the AppRouter*).

## Documentation

Architecture, build/run details, and the backend routing setup are documented in [DEVELOPMENT.md](DEVELOPMENT.md).
