'use strict';

var fs = require('fs');
var path = require('path');

// --- Constants ---
var EXPLORATION_WEIGHT = 1.41; // sqrt(2)
var MEMORY_FILE = path.join(__dirname, 'ai-memory.json');
var MEMORY_SAVE_INTERVAL_MS = 30000; // save every 30 seconds
var LEARNING_RATE = 0.8; // how much memory influences initial node values
var MAX_MEMORY_ENTRIES = 50000; // cap to prevent unbounded growth

var DIFFICULTY = {
  easy: { min: 50, max: 150 },
  medium: { min: 400, max: 600 },
  hard: { min: 1800, max: 2200 },
};

// --- Position Memory (Transposition Table) ---

var memory = {};    // boardKey -> { wins: number, visits: number, lastSeen: timestamp }
var memoryDirty = false;

function boardToKey(board) {
  return board.join(',');
}

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      var data = fs.readFileSync(MEMORY_FILE, 'utf8');
      memory = JSON.parse(data);
      var count = Object.keys(memory).length;
      console.log('AI memory loaded: ' + count + ' positions');
    }
  } catch (err) {
    console.error('Failed to load AI memory:', err.message);
    memory = {};
  }
}

function saveMemory() {
  if (!memoryDirty) return;
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory), 'utf8');
    memoryDirty = false;
  } catch (err) {
    console.error('Failed to save AI memory:', err.message);
  }
}

function pruneMemory() {
  var keys = Object.keys(memory);
  if (keys.length <= MAX_MEMORY_ENTRIES) return;

  // Remove least visited entries
  keys.sort(function(a, b) { return memory[a].visits - memory[b].visits; });
  var toRemove = keys.length - MAX_MEMORY_ENTRIES;
  for (var i = 0; i < toRemove; i++) {
    delete memory[keys[i]];
  }
}

function getMemoryEntry(board) {
  return memory[boardToKey(board)] || null;
}

function updateMemory(board, aiSymbol, result) {
  var key = boardToKey(board);
  if (!memory[key]) {
    memory[key] = { wins: 0, visits: 0, lastSeen: Date.now() };
  }

  var entry = memory[key];
  entry.visits++;
  entry.lastSeen = Date.now();

  if (result === aiSymbol) {
    entry.wins++;
  } else if (result !== 'draw') {
    entry.wins--;
  }
  // draws: visits increase but wins stay same → lower win rate

  memoryDirty = true;
}

// Initialize memory on module load
loadMemory();

// Periodic save
setInterval(function() {
  saveMemory();
}, MEMORY_SAVE_INTERVAL_MS);

// Save on process exit
process.on('exit', saveMemory);
process.on('SIGINT', function() { saveMemory(); process.exit(); });
process.on('SIGTERM', function() { saveMemory(); process.exit(); });

// --- MCTS Node ---

function MCTSNode(board, symbol, parent, move, cols, rows) {
  this.board = board.slice();
  this.symbol = symbol;
  this.parent = parent;
  this.move = move;
  this.cols = cols;
  this.rows = rows;
  this.children = [];
  this.untriedMoves = this._getAvailableMoves();

  // Initialize from memory if available
  var memEntry = getMemoryEntry(this.board);
  if (memEntry && memEntry.visits > 0) {
    this.wins = Math.round(memEntry.wins * LEARNING_RATE);
    this.visits = Math.round(memEntry.visits * LEARNING_RATE);
  } else {
    this.wins = 0;
    this.visits = 0;
  }
}

MCTSNode.prototype._getAvailableMoves = function() {
  var moves = [];
  for (var i = 0; i < this.board.length; i++) {
    if (this.board[i] === '') { moves.push(i); }
  }
  return moves;
};

MCTSNode.prototype._nextSymbol = function() {
  return this.symbol === 'O' ? 'X' : 'O';
};

MCTSNode.prototype.isFullyExpanded = function() {
  return this.untriedMoves.length === 0;
};

MCTSNode.prototype.isTerminal = function() {
  return this._checkWinner('O') || this._checkWinner('X') ||
    this._getAvailableMoves().length === 0;
};

MCTSNode.prototype._generateWinSequences = function() {
  var cols = this.cols;
  var rows = this.rows;
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
};

MCTSNode.prototype._checkWinner = function(symbol) {
  var board = this.board;
  var sequences = this._generateWinSequences();
  return sequences.some(function(seq) {
    return seq.every(function(idx) { return board[idx] === symbol; });
  });
};

MCTSNode.prototype.bestChild = function(explorationWeight) {
  var best = null;
  var bestScore = -Infinity;

  for (var i = 0; i < this.children.length; i++) {
    var child = this.children[i];
    if (child.visits === 0) {
      // Unvisited children get maximum exploration score
      return child;
    }
    var exploitation = child.wins / child.visits;
    var exploration = Math.sqrt(Math.log(this.visits) / child.visits);
    var score = exploitation + explorationWeight * exploration;

    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
};

MCTSNode.prototype.expand = function() {
  var moveIdx = Math.floor(Math.random() * this.untriedMoves.length);
  var move = this.untriedMoves.splice(moveIdx, 1)[0];
  var nextSymbol = this._nextSymbol();
  var newBoard = this.board.slice();
  newBoard[move] = nextSymbol;

  var child = new MCTSNode(newBoard, nextSymbol, this, move, this.cols, this.rows);
  this.children.push(child);
  return child;
};

MCTSNode.prototype.simulate = function() {
  var simBoard = this.board.slice();
  var currentSymbol = this._nextSymbol();

  var available = [];
  for (var i = 0; i < simBoard.length; i++) {
    if (simBoard[i] === '') { available.push(i); }
  }

  var sequences = this._generateWinSequences();
  function hasWon(sym) {
    return sequences.some(function(seq) {
      return seq.every(function(idx) { return simBoard[idx] === sym; });
    });
  }

  while (available.length > 0) {
    var randIdx = Math.floor(Math.random() * available.length);
    var move = available.splice(randIdx, 1)[0];
    simBoard[move] = currentSymbol;

    if (hasWon(currentSymbol)) {
      return currentSymbol;
    }

    currentSymbol = currentSymbol === 'O' ? 'X' : 'O';
  }

  return 'draw';
};

MCTSNode.prototype.backpropagate = function(winner, aiSymbol) {
  var node = this;
  while (node !== null) {
    node.visits++;
    if (winner === aiSymbol) {
      node.wins++;
    } else if (winner !== 'draw') {
      node.wins--;
    }
    node = node.parent;
  }
};

// --- Public API ---

function getIterations(difficulty) {
  var range = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

function findBestMove(board, aiSymbol, cols, rows, difficulty) {
  var iterations = getIterations(difficulty);

  var opponentSymbol = aiSymbol === 'O' ? 'X' : 'O';
  var root = new MCTSNode(board, opponentSymbol, null, null, cols, rows);

  for (var i = 0; i < iterations; i++) {
    var node = root;

    // Selection
    while (node.isFullyExpanded() && node.children.length > 0) {
      node = node.bestChild(EXPLORATION_WEIGHT);
    }

    // Expansion
    if (!node.isTerminal() && !node.isFullyExpanded()) {
      node = node.expand();
    }

    // Simulation
    var result;
    if (node.isTerminal()) {
      if (node._checkWinner(aiSymbol)) {
        result = aiSymbol;
      } else if (node._checkWinner(opponentSymbol)) {
        result = opponentSymbol;
      } else {
        result = 'draw';
      }
    } else {
      result = node.simulate();
    }

    // Backpropagation
    node.backpropagate(result, aiSymbol);
  }

  // Pick the child with the most visits
  var bestMove = -1;
  var mostVisits = -1;
  for (var j = 0; j < root.children.length; j++) {
    if (root.children[j].visits > mostVisits) {
      mostVisits = root.children[j].visits;
      bestMove = root.children[j].move;
    }
  }

  return bestMove;
}

/**
 * Record the outcome of a completed game.
 * Called after every AI game to update the position memory.
 *
 * @param {Array<Array>} positionHistory - array of board snapshots from the game
 * @param {string} aiSymbol - the symbol AI played
 * @param {string} result - 'O', 'X', or 'draw'
 */
function recordGame(positionHistory, aiSymbol, result) {
  for (var i = 0; i < positionHistory.length; i++) {
    updateMemory(positionHistory[i], aiSymbol, result);
  }
  pruneMemory();
}

/**
 * Get memory statistics for monitoring.
 */
function getStats() {
  var keys = Object.keys(memory);
  var totalVisits = 0;
  for (var i = 0; i < keys.length; i++) {
    totalVisits += memory[keys[i]].visits;
  }
  return {
    positions: keys.length,
    totalVisits: totalVisits,
  };
}

module.exports = {
  findBestMove: findBestMove,
  recordGame: recordGame,
  getStats: getStats,
};
