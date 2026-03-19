var WebSocket = require('ws');
var http = require('http');
var crypto = require('crypto');

var server = http.createServer();
var wss = new WebSocket.Server({ server: server });

// State
var players = {};   // id -> { ws, name, status }  status: 'lobby' | 'ingame'
var games = {};     // gameId -> { player1, player2, board, currentTurn, cols, rows }

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
  return Object.keys(players).map(function(id) {
    return { id: id, name: players[id].name, status: players[id].status };
  });
}

function broadcastPlayerList() {
  broadcast({ type: 'playerList', players: getPlayerList() });
}

function createGame(player1Id, player2Id) {
  var gameId = crypto.randomUUID();
  var cols = 3, rows = 3;
  var board = [];
  for (var i = 0; i < cols * rows; i++) {
    board.push('');
  }

  games[gameId] = {
    player1: player1Id,
    player2: player2Id,
    board: board,
    currentTurn: player1Id,
    cols: cols,
    rows: rows,
  };

  players[player1Id].status = 'ingame';
  players[player2Id].status = 'ingame';

  sendTo(player1Id, {
    type: 'gameStart',
    gameId: gameId,
    symbol: 'O',
    opponent: players[player2Id].name,
    cols: cols,
    rows: rows,
  });

  sendTo(player2Id, {
    type: 'gameStart',
    gameId: gameId,
    symbol: 'X',
    opponent: players[player1Id].name,
    cols: cols,
    rows: rows,
  });

  broadcastPlayerList();
  return gameId;
}

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

function endGame(gameId, reason) {
  var game = games[gameId];
  if (!game) return;

  if (players[game.player1]) {
    players[game.player1].status = 'lobby';
  }
  if (players[game.player2]) {
    players[game.player2].status = 'lobby';
  }

  delete games[gameId];
  broadcastPlayerList();
}

wss.on('connection', function(ws) {
  var playerId = crypto.randomUUID();

  ws.on('message', function(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'join':
        players[playerId] = { ws: ws, name: msg.name, status: 'lobby' };
        sendTo(playerId, { type: 'joined', id: playerId, name: msg.name });
        broadcastPlayerList();
        break;

      case 'invite':
        var target = players[msg.targetId];
        if (target && target.status === 'lobby') {
          sendTo(msg.targetId, {
            type: 'invite',
            fromId: playerId,
            fromName: players[playerId].name,
          });
        }
        break;

      case 'acceptInvite':
        var inviter = players[msg.fromId];
        if (inviter && inviter.status === 'lobby' && players[playerId].status === 'lobby') {
          createGame(msg.fromId, playerId);
        }
        break;

      case 'declineInvite':
        sendTo(msg.fromId, {
          type: 'inviteDeclined',
          byName: players[playerId].name,
        });
        break;

      case 'move':
        var game = games[msg.gameId];
        if (!game) break;
        if (game.currentTurn !== playerId) break;

        var idx = msg.index;
        if (idx < 0 || idx >= game.board.length || game.board[idx] !== '') break;

        var symbol = playerId === game.player1 ? 'O' : 'X';
        game.board[idx] = symbol;

        // Notify both players
        sendTo(game.player1, { type: 'moveMade', index: idx, symbol: symbol });
        sendTo(game.player2, { type: 'moveMade', index: idx, symbol: symbol });

        var sequences = generateWinningSequences(game.cols, game.rows);
        if (checkWin(game.board, symbol, sequences)) {
          var winnerName = players[playerId].name;
          sendTo(game.player1, { type: 'gameOver', result: 'win', winner: winnerName, symbol: symbol });
          sendTo(game.player2, { type: 'gameOver', result: 'win', winner: winnerName, symbol: symbol });
          endGame(msg.gameId);
        } else if (checkDraw(game.board)) {
          sendTo(game.player1, { type: 'gameOver', result: 'draw' });
          sendTo(game.player2, { type: 'gameOver', result: 'draw' });
          endGame(msg.gameId);
        } else {
          game.currentTurn = playerId === game.player1 ? game.player2 : game.player1;
        }
        break;

      case 'refreshList':
        sendTo(playerId, { type: 'playerList', players: getPlayerList() });
        break;

      case 'leaveGame':
        var g = games[msg.gameId];
        if (!g) break;
        var opponentId = g.player1 === playerId ? g.player2 : g.player1;
        sendTo(opponentId, { type: 'opponentLeft' });
        endGame(msg.gameId);
        break;
    }
  });

  ws.on('close', function() {
    // If player was in a game, notify opponent
    Object.keys(games).forEach(function(gId) {
      var g = games[gId];
      if (g.player1 === playerId || g.player2 === playerId) {
        var opId = g.player1 === playerId ? g.player2 : g.player1;
        sendTo(opId, { type: 'opponentLeft' });
        endGame(gId);
      }
    });

    delete players[playerId];
    broadcastPlayerList();
  });
});

var PORT = 8082;
server.listen(PORT, function() {
  console.log('WebSocket server running on ws://localhost:' + PORT);
});
