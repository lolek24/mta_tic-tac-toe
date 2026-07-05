'use strict';

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const ai = require('./aiClient');
const auth = require('./auth');
const gameRules = require('./gameRules');
const log = require('./logger');

// Constants
const PORT = process.env.PORT || 8082;
const BOARD_COLS = 3;
const BOARD_ROWS = 3;
const SYMBOLS = { PLAYER1: 'O', PLAYER2: 'X' };
const AI_MOVE_DELAY_MS = 300;
const GAME_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_NAME_LENGTH = 30;
const MAX_PAYLOAD_BYTES = 4096; // reject oversized WS frames (DoS guard)
const INVITE_TIMEOUT_MS = 60 * 1000; // invites expire after 1 minute
const INVITE_SWEEP_MS = 60 * 1000;   // periodic prune of expired invites

// Comma-separated allowlist of accepted Origins (e.g. "https://app.example.com").
// Empty => allow any Origin (dev convenience). Set this in production.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP, 10) || 20;
const MSG_WINDOW_MS = 10 * 1000;   // sliding window for per-connection message rate limit
const MSG_MAX_PER_WINDOW = 60;     // max messages allowed per window per connection
const INVITE_COOLDOWN_MS = 2000;   // minimum gap between invites from a single player

const ipConnections = {}; // ip -> active connection count (per-IP cap)

// Reject connections at the handshake: Origin allowlist + per-IP cap + JWT auth.
function verifyClient(info) {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.indexOf(info.origin) === -1) {
    return false;
  }
  const ip = info.req.socket.remoteAddress;
  if ((ipConnections[ip] || 0) >= MAX_CONNECTIONS_PER_IP) {
    return false;
  }
  // JWT verification (no-op unless JWT_AUTH_ENABLED=true). Stash the verified
  // claims on the request so the 'connection' handler can read them — this is
  // the same req object emitted with the connection.
  const authResult = auth.authenticate(info.req);
  if (!authResult.valid) {
    log.warn('Rejected WS handshake', { ip, reason: authResult.error });
    return false;
  }
  info.req.authClaims = authResult.claims;
  return true;
}

const server = http.createServer();
const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient,
});

if (ALLOWED_ORIGINS.length === 0) {
  log.warn('ALLOWED_ORIGINS not set — accepting WebSocket connections from any Origin');
}

// State
const players = {};   // id -> { ws, name, status }
const games = {};     // gameId -> { player1, player2, board, currentTurn, cols, rows, isAI, aiSymbol, difficulty, timeout }
const invites = {};   // "fromId->targetId" -> expiresAt (timestamp)

// --- Invite registry ---

function inviteKey(fromId, targetId) {
  return `${fromId}->${targetId}`;
}

function addInvite(fromId, targetId) {
  invites[inviteKey(fromId, targetId)] = Date.now() + INVITE_TIMEOUT_MS;
}

// Returns true only if a non-expired invite existed; consumes it either way.
function consumeInvite(fromId, targetId) {
  const key = inviteKey(fromId, targetId);
  const expiresAt = invites[key];
  if (expiresAt === undefined) return false;
  delete invites[key];
  return expiresAt >= Date.now();
}

function clearInvitesFor(playerId) {
  Object.keys(invites).forEach((key) => {
    const parts = key.split('->');
    if (parts[0] === playerId || parts[1] === playerId) {
      delete invites[key];
    }
  });
}

// Periodically prune expired invites so the registry can't grow unbounded.
// unref() so this timer never keeps the process alive on its own (e.g. tests).
setInterval(() => {
  const now = Date.now();
  Object.keys(invites).forEach((key) => {
    if (invites[key] < now) { delete invites[key]; }
  });
}, INVITE_SWEEP_MS).unref();

// --- Helpers ---

function broadcast(data) {
  const msg = JSON.stringify(data);
  Object.keys(players).forEach((id) => {
    const p = players[id];
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  });
}

function sendTo(playerId, data) {
  const p = players[playerId];
  if (p && p.ws.readyState === WebSocket.OPEN) {
    p.ws.send(JSON.stringify(data));
  }
}

function getPlayerList() {
  return Object.keys(players)
    .filter((id) => players[id].status !== 'pending')
    .map((id) => ({ id, name: players[id].name, status: players[id].status }));
}

function broadcastPlayerList() {
  broadcast({ type: 'playerList', players: getPlayerList() });
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  const clean = name.trim().substring(0, MAX_NAME_LENGTH);
  return clean || 'Player';
}

function validateDifficulty(difficulty) {
  return VALID_DIFFICULTIES.indexOf(difficulty) !== -1 ? difficulty : 'medium';
}

function createEmptyBoard(cols, rows) {
  const board = [];
  for (let i = 0; i < cols * rows; i++) {
    board.push('');
  }
  return board;
}

// --- Game timeout ---

function resetGameTimeout(gameId) {
  const game = games[gameId];
  if (!game) return;

  if (game.timeout) {
    clearTimeout(game.timeout);
  }

  game.timeout = setTimeout(() => {
    const g = games[gameId];
    if (!g) return;

    sendTo(g.player1, { type: 'gameOver', result: 'timeout', message: 'Game timed out due to inactivity' });
    if (!g.isAI && g.player2) {
      sendTo(g.player2, { type: 'gameOver', result: 'timeout', message: 'Game timed out due to inactivity' });
    }
    endGame(gameId);
  }, GAME_TIMEOUT_MS);
}

// --- Game lifecycle ---

function createGame(player1Id, player2Id) {
  const gameId = crypto.randomUUID();
  const board = createEmptyBoard(BOARD_COLS, BOARD_ROWS);

  games[gameId] = {
    player1: player1Id,
    player2: player2Id,
    board,
    currentTurn: player1Id,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    isAI: false,
    timeout: null,
  };

  players[player1Id].status = 'ingame';
  players[player2Id].status = 'ingame';

  // Both players are now busy — drop any invites involving either of them.
  clearInvitesFor(player1Id);
  clearInvitesFor(player2Id);

  sendTo(player1Id, {
    type: 'gameStart',
    gameId,
    symbol: SYMBOLS.PLAYER1,
    opponent: players[player2Id].name,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
  });

  sendTo(player2Id, {
    type: 'gameStart',
    gameId,
    symbol: SYMBOLS.PLAYER2,
    opponent: players[player1Id].name,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
  });

  resetGameTimeout(gameId);
  broadcastPlayerList();
  return gameId;
}

function createAIGame(playerId, difficulty) {
  const gameId = crypto.randomUUID();
  const validDifficulty = validateDifficulty(difficulty);
  const board = createEmptyBoard(BOARD_COLS, BOARD_ROWS);

  games[gameId] = {
    player1: playerId,
    player2: 'AI',
    board,
    currentTurn: playerId,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    isAI: true,
    aiSymbol: SYMBOLS.PLAYER2,
    difficulty: validDifficulty,
    timeout: null,
    // Real positions accumulate as moves are made; the empty board is excluded
    // so it doesn't get recorded as noise on every AI game.
    positionHistory: [],
  };

  players[playerId].status = 'ingame';

  sendTo(playerId, {
    type: 'gameStart',
    gameId,
    symbol: SYMBOLS.PLAYER1,
    opponent: `Computer (${validDifficulty})`,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
  });

  resetGameTimeout(gameId);
  broadcastPlayerList();
  return gameId;
}

function endGame(gameId, result) {
  const game = games[gameId];
  if (!game) return;

  if (game.timeout) {
    clearTimeout(game.timeout);
  }

  // Record game for AI learning (fire-and-forget; runs in the AI worker).
  if (game.isAI && game.positionHistory && result) {
    ai.recordGame(game.positionHistory, game.aiSymbol, result)
      .then((stats) => log.info(`AI learned from game (${result})`, { positions: stats.positions, totalVisits: stats.totalVisits }))
      .catch((err) => log.error('Failed to record game', err.message));
  }

  if (players[game.player1]) {
    players[game.player1].status = 'lobby';
  }
  if (!game.isAI && players[game.player2]) {
    players[game.player2].status = 'lobby';
  }

  delete games[gameId];
  broadcastPlayerList();
}

async function processAIMove(gameId) {
  const game = games[gameId];
  if (!game || !game.isAI) return;

  try {
    const aiMove = await ai.findBestMove(
      game.board, game.aiSymbol, game.cols, game.rows, game.difficulty
    );

    // The player may have left (game removed) while the worker was computing.
    const g = games[gameId];
    if (!g || !g.isAI) return;
    if (aiMove === -1) return;

    g.board[aiMove] = g.aiSymbol;
    g.positionHistory.push(g.board.slice());

    sendTo(g.player1, { type: 'moveMade', index: aiMove, symbol: g.aiSymbol });

    const sequences = gameRules.generateWinningSequences(g.cols, g.rows);
    if (gameRules.checkWin(g.board, g.aiSymbol, sequences)) {
      sendTo(g.player1, { type: 'gameOver', result: 'win', winner: 'Computer', symbol: g.aiSymbol });
      endGame(gameId, g.aiSymbol);
    } else if (gameRules.checkDraw(g.board)) {
      sendTo(g.player1, { type: 'gameOver', result: 'draw' });
      endGame(gameId, 'draw');
    } else {
      g.currentTurn = g.player1;
      resetGameTimeout(gameId);
    }
  } catch (err) {
    log.error('AI move error', err.message);
    const g = games[gameId];
    if (g) { sendTo(g.player1, { type: 'error', message: 'AI error, please restart' }); }
  }
}

// --- Notify game result to both players ---

function notifyBothPlayers(game, data) {
  sendTo(game.player1, data);
  if (!game.isAI) {
    sendTo(game.player2, data);
  }
}

// --- WebSocket connection handler ---

wss.on('connection', (ws, req) => {
  const playerId = crypto.randomUUID();
  const ip = req.socket.remoteAddress;
  const authClaims = req.authClaims || null; // verified in verifyClient (null if auth disabled)
  ipConnections[ip] = (ipConnections[ip] || 0) + 1;

  let windowStart = 0;
  let msgCount = 0;

  ws.on('message', (raw) => {
    // Per-connection sliding-window message rate limit (DoS / flood guard).
    const now = Date.now();
    if (now - windowStart > MSG_WINDOW_MS) {
      windowStart = now;
      msgCount = 0;
    }
    msgCount++;
    if (msgCount > MSG_MAX_PER_WINDOW) { return; } // silently drop excess

    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    // Require a successful join before any other action.
    if (msg.type !== 'join' && players[playerId].status === 'pending') {
      sendTo(playerId, { type: 'error', message: 'Not connected. Send join first.' });
      return;
    }

    try {
      handleMessage(playerId, msg);
    } catch (err) {
      log.error('Message handler error', err.message);
    }
  });

  ws.on('close', () => {
    if (ipConnections[ip]) {
      ipConnections[ip]--;
      if (ipConnections[ip] <= 0) { delete ipConnections[ip]; }
    }

    // Clean up games
    Object.keys(games).forEach((gId) => {
      const g = games[gId];
      if (g.player1 === playerId || g.player2 === playerId) {
        if (!g.isAI) {
          const opId = g.player1 === playerId ? g.player2 : g.player1;
          sendTo(opId, { type: 'opponentLeft' });
        }
        endGame(gId);
      }
    });

    clearInvitesFor(playerId);
    delete players[playerId];
    broadcastPlayerList();
  });

  // Store ws for sendTo before join
  players[playerId] = { ws, name: '', status: 'pending', lastInviteAt: 0, claims: authClaims };
});

function handleMessage(playerId, msg) {
  switch (msg.type) {
    case 'join': {
      // Only a fresh, not-yet-joined connection may join. This blocks a
      // re-join mid-game (which would desync game state) and mid-game renames.
      if (players[playerId].status !== 'pending') break;
      // When JWT auth is on, the verified identity wins over any client-supplied
      // name so a player cannot spoof another user's display name.
      const authName = auth.nameFromClaims(players[playerId].claims);
      const name = authName ? sanitizeName(authName) : sanitizeName(msg.name);
      players[playerId].name = name;
      players[playerId].status = 'lobby';
      sendTo(playerId, { type: 'joined', id: playerId, name });
      broadcastPlayerList();
      break;
    }

    case 'playAI':
      if (players[playerId].status !== 'lobby') break;
      createAIGame(playerId, msg.difficulty);
      break;

    case 'invite': {
      if (players[playerId].status !== 'lobby') break;
      if (typeof msg.targetId !== 'string') break;
      const target = players[msg.targetId];
      if (target && target.status === 'lobby' && msg.targetId !== playerId) {
        // Rate-limit invites from a single player to prevent dialog flooding.
        const nowInvite = Date.now();
        if (nowInvite - players[playerId].lastInviteAt < INVITE_COOLDOWN_MS) break;
        players[playerId].lastInviteAt = nowInvite;
        addInvite(playerId, msg.targetId);
        sendTo(msg.targetId, {
          type: 'invite',
          fromId: playerId,
          fromName: players[playerId].name,
        });
      }
      break;
    }

    case 'acceptInvite': {
      if (typeof msg.fromId !== 'string') break;
      // Only accept an invite that was actually sent to this player and hasn't
      // expired — prevents forcing a game onto an unsuspecting player.
      if (!consumeInvite(msg.fromId, playerId)) break;
      const inviter = players[msg.fromId];
      if (inviter && inviter.status === 'lobby' && players[playerId].status === 'lobby') {
        createGame(msg.fromId, playerId);
      }
      break;
    }

    case 'declineInvite':
      if (typeof msg.fromId !== 'string') break;
      // Only a real, pending invite can be declined — blocks spoofed decline toasts.
      if (!consumeInvite(msg.fromId, playerId)) break;
      sendTo(msg.fromId, {
        type: 'inviteDeclined',
        byName: players[playerId].name,
      });
      break;

    case 'move':
      handleMove(playerId, msg);
      break;

    case 'refreshList':
      sendTo(playerId, { type: 'playerList', players: getPlayerList() });
      break;

    case 'leaveGame': {
      if (typeof msg.gameId !== 'string') break;
      const g = games[msg.gameId];
      if (!g) break;
      // Verify player is in this game
      if (g.player1 !== playerId && g.player2 !== playerId) break;
      if (g.isAI) {
        endGame(msg.gameId);
      } else {
        const opponentId = g.player1 === playerId ? g.player2 : g.player1;
        sendTo(opponentId, { type: 'opponentLeft' });
        endGame(msg.gameId);
      }
      break;
    }
  }
}

function handleMove(playerId, msg) {
  if (typeof msg.gameId !== 'string' || typeof msg.index !== 'number') return;

  const game = games[msg.gameId];
  if (!game) return;

  // Verify this player belongs to this game
  if (game.player1 !== playerId && game.player2 !== playerId) return;

  // Verify it's this player's turn
  if (game.currentTurn !== playerId) return;

  const idx = msg.index;
  if (!Number.isInteger(idx) || idx < 0 || idx >= game.board.length) return;
  if (game.board[idx] !== '') return;

  const symbol = playerId === game.player1 ? SYMBOLS.PLAYER1 : SYMBOLS.PLAYER2;
  game.board[idx] = symbol;

  // Record position for AI learning
  if (game.isAI && game.positionHistory) {
    game.positionHistory.push(game.board.slice());
  }

  notifyBothPlayers(game, { type: 'moveMade', index: idx, symbol });

  const sequences = gameRules.generateWinningSequences(game.cols, game.rows);
  if (gameRules.checkWin(game.board, symbol, sequences)) {
    const winnerName = players[playerId] ? players[playerId].name : 'Unknown';
    notifyBothPlayers(game, { type: 'gameOver', result: 'win', winner: winnerName, symbol });
    endGame(msg.gameId, symbol);
  } else if (gameRules.checkDraw(game.board)) {
    notifyBothPlayers(game, { type: 'gameOver', result: 'draw' });
    endGame(msg.gameId, 'draw');
  } else {
    if (game.isAI) {
      game.currentTurn = 'AI';
      setTimeout(() => processAIMove(msg.gameId), AI_MOVE_DELAY_MS);
    } else {
      game.currentTurn = playerId === game.player1 ? game.player2 : game.player1;
    }
    resetGameTimeout(msg.gameId);
  }
}

// Only auto-listen when run directly; when required (tests) the caller controls
// the lifecycle via the exported server.
if (require.main === module) {
  server.listen(PORT, () => {
    log.info(`WebSocket server running on ws://localhost:${PORT}`);
  });

  // Flush the AI worker's learned memory before exiting.
  const shutdown = () => { ai.shutdown().finally(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { server, wss };
