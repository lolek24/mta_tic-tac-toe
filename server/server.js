'use strict';

var WebSocket = require('ws');
var http = require('http');
var crypto = require('crypto');
var MonteCarloAI = require('./MonteCarloAI');
var auth = require('./auth');

// Constants
var PORT = process.env.PORT || 8082;
var BOARD_COLS = 3;
var BOARD_ROWS = 3;
var SYMBOLS = { PLAYER1: 'O', PLAYER2: 'X' };
var AI_MOVE_DELAY_MS = 300;
var GAME_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity
var VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
var MAX_NAME_LENGTH = 30;
var MAX_PAYLOAD_BYTES = 4096; // reject oversized WS frames (DoS guard)
var INVITE_TIMEOUT_MS = 60 * 1000; // invites expire after 1 minute
var INVITE_SWEEP_MS = 60 * 1000;   // periodic prune of expired invites

// Comma-separated allowlist of accepted Origins (e.g. "https://app.example.com").
// Empty => allow any Origin (dev convenience). Set this in production.
var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
var MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP, 10) || 20;
var MSG_WINDOW_MS = 10 * 1000;   // sliding window for per-connection message rate limit
var MSG_MAX_PER_WINDOW = 60;     // max messages allowed per window per connection
var INVITE_COOLDOWN_MS = 2000;   // minimum gap between invites from a single player

var ipConnections = {}; // ip -> active connection count (per-IP cap)

// Reject connections at the handshake: Origin allowlist + per-IP cap + JWT auth.
function verifyClient(info) {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.indexOf(info.origin) === -1) {
    return false;
  }
  var ip = info.req.socket.remoteAddress;
  if ((ipConnections[ip] || 0) >= MAX_CONNECTIONS_PER_IP) {
    return false;
  }
  // JWT verification (no-op unless JWT_AUTH_ENABLED=true). Stash the verified
  // claims on the request so the 'connection' handler can read them — this is
  // the same req object emitted with the connection.
  var authResult = auth.authenticate(info.req);
  if (!authResult.valid) {
    console.warn('Rejected WS handshake from ' + ip + ': ' + authResult.error);
    return false;
  }
  info.req.authClaims = authResult.claims;
  return true;
}

var server = http.createServer();
var wss = new WebSocket.Server({
  server: server,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: verifyClient,
});

if (ALLOWED_ORIGINS.length === 0) {
  console.warn('WARNING: ALLOWED_ORIGINS not set — accepting WebSocket connections from any Origin.');
}

// State
var players = {};   // id -> { ws, name, status }
var games = {};     // gameId -> { player1, player2, board, currentTurn, cols, rows, isAI, aiSymbol, difficulty, timeout }
var invites = {};   // "fromId->targetId" -> expiresAt (timestamp)

// --- Invite registry ---

function inviteKey(fromId, targetId) {
  return fromId + '->' + targetId;
}

function addInvite(fromId, targetId) {
  invites[inviteKey(fromId, targetId)] = Date.now() + INVITE_TIMEOUT_MS;
}

// Returns true only if a non-expired invite existed; consumes it either way.
function consumeInvite(fromId, targetId) {
  var key = inviteKey(fromId, targetId);
  var expiresAt = invites[key];
  if (expiresAt === undefined) return false;
  delete invites[key];
  return expiresAt >= Date.now();
}

function clearInvitesFor(playerId) {
  Object.keys(invites).forEach(function(key) {
    var parts = key.split('->');
    if (parts[0] === playerId || parts[1] === playerId) {
      delete invites[key];
    }
  });
}

// Periodically prune expired invites so the registry can't grow unbounded.
setInterval(function() {
  var now = Date.now();
  Object.keys(invites).forEach(function(key) {
    if (invites[key] < now) { delete invites[key]; }
  });
}, INVITE_SWEEP_MS);

// --- Helpers ---

function broadcast(data) {
  var msg = JSON.stringify(data);
  Object.keys(players).forEach(function(id) {
    var p = players[id];
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  });
}

function sendTo(playerId, data) {
  var p = players[playerId];
  if (p && p.ws.readyState === WebSocket.OPEN) {
    p.ws.send(JSON.stringify(data));
  }
}

function getPlayerList() {
  return Object.keys(players)
    .filter(function(id) { return players[id].status !== 'pending'; })
    .map(function(id) {
      return { id: id, name: players[id].name, status: players[id].status };
    });
}

function broadcastPlayerList() {
  broadcast({ type: 'playerList', players: getPlayerList() });
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  var clean = name.trim().substring(0, MAX_NAME_LENGTH);
  return clean || 'Player';
}

function validateDifficulty(difficulty) {
  return VALID_DIFFICULTIES.indexOf(difficulty) !== -1 ? difficulty : 'medium';
}

function createEmptyBoard(cols, rows) {
  var board = [];
  for (var i = 0; i < cols * rows; i++) {
    board.push('');
  }
  return board;
}

// --- Game timeout ---

function resetGameTimeout(gameId) {
  var game = games[gameId];
  if (!game) return;

  if (game.timeout) {
    clearTimeout(game.timeout);
  }

  game.timeout = setTimeout(function() {
    var g = games[gameId];
    if (!g) return;

    sendTo(g.player1, { type: 'gameOver', result: 'timeout', message: 'Game timed out due to inactivity' });
    if (!g.isAI && g.player2) {
      sendTo(g.player2, { type: 'gameOver', result: 'timeout', message: 'Game timed out due to inactivity' });
    }
    endGame(gameId);
  }, GAME_TIMEOUT_MS);
}

// --- Win detection ---

function generateWinningSequences(cols, rows) {
  var sequences = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) { row.push(r * cols + c); }
    sequences.push(row);
  }
  for (var c2 = 0; c2 < cols; c2++) {
    var col = [];
    for (var r2 = 0; r2 < rows; r2++) { col.push(r2 * cols + c2); }
    sequences.push(col);
  }
  if (cols === rows) {
    var d1 = [], d2 = [];
    for (var d = 0; d < cols; d++) {
      d1.push(d * cols + d);
      d2.push(d * cols + (cols - 1 - d));
    }
    sequences.push(d1);
    sequences.push(d2);
  }
  return sequences;
}

function checkWin(board, symbol, sequences) {
  return sequences.some(function(seq) {
    return seq.every(function(idx) { return board[idx] === symbol; });
  });
}

function checkDraw(board) {
  return board.every(function(cell) { return cell !== ''; });
}

// --- Game lifecycle ---

function createGame(player1Id, player2Id) {
  var gameId = crypto.randomUUID();
  var board = createEmptyBoard(BOARD_COLS, BOARD_ROWS);

  games[gameId] = {
    player1: player1Id,
    player2: player2Id,
    board: board,
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
    gameId: gameId,
    symbol: SYMBOLS.PLAYER1,
    opponent: players[player2Id].name,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
  });

  sendTo(player2Id, {
    type: 'gameStart',
    gameId: gameId,
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
  var gameId = crypto.randomUUID();
  var validDifficulty = validateDifficulty(difficulty);
  var board = createEmptyBoard(BOARD_COLS, BOARD_ROWS);

  games[gameId] = {
    player1: playerId,
    player2: 'AI',
    board: board,
    currentTurn: playerId,
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    isAI: true,
    aiSymbol: SYMBOLS.PLAYER2,
    difficulty: validDifficulty,
    timeout: null,
    positionHistory: [board.slice()],
  };

  players[playerId].status = 'ingame';

  sendTo(playerId, {
    type: 'gameStart',
    gameId: gameId,
    symbol: SYMBOLS.PLAYER1,
    opponent: 'Computer (' + validDifficulty + ')',
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
  });

  resetGameTimeout(gameId);
  broadcastPlayerList();
  return gameId;
}

function endGame(gameId, result) {
  var game = games[gameId];
  if (!game) return;

  if (game.timeout) {
    clearTimeout(game.timeout);
  }

  // Record game for AI learning
  if (game.isAI && game.positionHistory && result) {
    try {
      MonteCarloAI.recordGame(game.positionHistory, game.aiSymbol, result);
      var stats = MonteCarloAI.getStats();
      console.log('AI learned from game (' + result + '). Memory: ' + stats.positions + ' positions, ' + stats.totalVisits + ' total visits');
    } catch (err) {
      console.error('Failed to record game:', err.message);
    }
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

function processAIMove(gameId) {
  var game = games[gameId];
  if (!game || !game.isAI) return;

  try {
    var aiMove = MonteCarloAI.findBestMove(
      game.board, game.aiSymbol, game.cols, game.rows, game.difficulty
    );

    if (aiMove === -1) return;

    game.board[aiMove] = game.aiSymbol;
    game.positionHistory.push(game.board.slice());

    sendTo(game.player1, { type: 'moveMade', index: aiMove, symbol: game.aiSymbol });

    var sequences = generateWinningSequences(game.cols, game.rows);
    if (checkWin(game.board, game.aiSymbol, sequences)) {
      sendTo(game.player1, { type: 'gameOver', result: 'win', winner: 'Computer', symbol: game.aiSymbol });
      endGame(gameId, game.aiSymbol);
    } else if (checkDraw(game.board)) {
      sendTo(game.player1, { type: 'gameOver', result: 'draw' });
      endGame(gameId, 'draw');
    } else {
      game.currentTurn = game.player1;
      resetGameTimeout(gameId);
    }
  } catch (err) {
    console.error('AI move error:', err);
    sendTo(game.player1, { type: 'error', message: 'AI error, please restart' });
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

wss.on('connection', function(ws, req) {
  var playerId = crypto.randomUUID();
  var ip = req.socket.remoteAddress;
  var authClaims = req.authClaims || null; // verified in verifyClient (null if auth disabled)
  ipConnections[ip] = (ipConnections[ip] || 0) + 1;

  var windowStart = 0;
  var msgCount = 0;

  ws.on('message', function(raw) {
    // Per-connection sliding-window message rate limit (DoS / flood guard).
    var now = Date.now();
    if (now - windowStart > MSG_WINDOW_MS) {
      windowStart = now;
      msgCount = 0;
    }
    msgCount++;
    if (msgCount > MSG_MAX_PER_WINDOW) { return; } // silently drop excess

    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    // Require a successful join before any other action.
    if (msg.type !== 'join' && players[playerId].status === 'pending') {
      sendTo(playerId, { type: 'error', message: 'Not connected. Send join first.' });
      return;
    }

    try {
      handleMessage(playerId, msg);
    } catch (err) {
      console.error('Message handler error:', err);
    }
  });

  ws.on('close', function() {
    if (ipConnections[ip]) {
      ipConnections[ip]--;
      if (ipConnections[ip] <= 0) { delete ipConnections[ip]; }
    }

    // Clean up games
    Object.keys(games).forEach(function(gId) {
      var g = games[gId];
      if (g.player1 === playerId || g.player2 === playerId) {
        if (!g.isAI) {
          var opId = g.player1 === playerId ? g.player2 : g.player1;
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
  players[playerId] = { ws: ws, name: '', status: 'pending', lastInviteAt: 0, claims: authClaims };
});

function handleMessage(playerId, msg) {
  switch (msg.type) {
    case 'join':
      // Only a fresh, not-yet-joined connection may join. This blocks a
      // re-join mid-game (which would desync game state) and mid-game renames.
      if (players[playerId].status !== 'pending') break;
      // When JWT auth is on, the verified identity wins over any client-supplied
      // name so a player cannot spoof another user's display name.
      var authName = auth.nameFromClaims(players[playerId].claims);
      var name = authName ? sanitizeName(authName) : sanitizeName(msg.name);
      players[playerId].name = name;
      players[playerId].status = 'lobby';
      sendTo(playerId, { type: 'joined', id: playerId, name: name });
      broadcastPlayerList();
      break;

    case 'playAI':
      if (players[playerId].status !== 'lobby') break;
      createAIGame(playerId, msg.difficulty);
      break;

    case 'invite':
      if (players[playerId].status !== 'lobby') break;
      if (typeof msg.targetId !== 'string') break;
      var target = players[msg.targetId];
      if (target && target.status === 'lobby' && msg.targetId !== playerId) {
        // Rate-limit invites from a single player to prevent dialog flooding.
        var nowInvite = Date.now();
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

    case 'acceptInvite':
      if (typeof msg.fromId !== 'string') break;
      // Only accept an invite that was actually sent to this player and hasn't
      // expired — prevents forcing a game onto an unsuspecting player.
      if (!consumeInvite(msg.fromId, playerId)) break;
      var inviter = players[msg.fromId];
      if (inviter && inviter.status === 'lobby' && players[playerId].status === 'lobby') {
        createGame(msg.fromId, playerId);
      }
      break;

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

    case 'leaveGame':
      if (typeof msg.gameId !== 'string') break;
      var g = games[msg.gameId];
      if (!g) break;
      // Verify player is in this game
      if (g.player1 !== playerId && g.player2 !== playerId) break;
      if (g.isAI) {
        endGame(msg.gameId);
      } else {
        var opponentId = g.player1 === playerId ? g.player2 : g.player1;
        sendTo(opponentId, { type: 'opponentLeft' });
        endGame(msg.gameId);
      }
      break;
  }
}

function handleMove(playerId, msg) {
  if (typeof msg.gameId !== 'string' || typeof msg.index !== 'number') return;

  var game = games[msg.gameId];
  if (!game) return;

  // Verify this player belongs to this game
  if (game.player1 !== playerId && game.player2 !== playerId) return;

  // Verify it's this player's turn
  if (game.currentTurn !== playerId) return;

  var idx = msg.index;
  if (!Number.isInteger(idx) || idx < 0 || idx >= game.board.length) return;
  if (game.board[idx] !== '') return;

  var symbol = playerId === game.player1 ? SYMBOLS.PLAYER1 : SYMBOLS.PLAYER2;
  game.board[idx] = symbol;

  // Record position for AI learning
  if (game.isAI && game.positionHistory) {
    game.positionHistory.push(game.board.slice());
  }

  notifyBothPlayers(game, { type: 'moveMade', index: idx, symbol: symbol });

  var sequences = generateWinningSequences(game.cols, game.rows);
  if (checkWin(game.board, symbol, sequences)) {
    var winnerName = players[playerId] ? players[playerId].name : 'Unknown';
    notifyBothPlayers(game, { type: 'gameOver', result: 'win', winner: winnerName, symbol: symbol });
    endGame(msg.gameId, symbol);
  } else if (checkDraw(game.board)) {
    notifyBothPlayers(game, { type: 'gameOver', result: 'draw' });
    endGame(msg.gameId, 'draw');
  } else {
    if (game.isAI) {
      game.currentTurn = 'AI';
      setTimeout(function() { processAIMove(msg.gameId); }, AI_MOVE_DELAY_MS);
    } else {
      game.currentTurn = playerId === game.player1 ? game.player2 : game.player1;
    }
    resetGameTimeout(msg.gameId);
  }
}

server.listen(PORT, function() {
  console.log('WebSocket server running on ws://localhost:' + PORT);
});
