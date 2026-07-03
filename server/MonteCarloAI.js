'use strict';

const fs = require('fs');
const path = require('path');

// --- Constants ---
const EXPLORATION_WEIGHT = 1.41; // sqrt(2)
const MEMORY_FILE = path.join(__dirname, 'ai-memory.json');
const MEMORY_SAVE_INTERVAL_MS = 30000; // save every 30 seconds
const LEARNING_RATE = 0.8; // how much memory influences initial node values
const MAX_MEMORY_ENTRIES = 50000; // cap to prevent unbounded growth

const DIFFICULTY = {
  easy: { min: 50, max: 150 },
  medium: { min: 400, max: 600 },
  hard: { min: 1800, max: 2200 },
};

// --- Position Memory (Transposition Table) ---

let memory = {};    // boardKey -> { wins: number, visits: number, lastSeen: timestamp }
let memoryDirty = false;

function boardToKey(board) {
  return board.join(',');
}

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      memory = JSON.parse(data);
      const count = Object.keys(memory).length;
      console.log(`AI memory loaded: ${count} positions`);
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
  const keys = Object.keys(memory);
  if (keys.length <= MAX_MEMORY_ENTRIES) return;

  // Remove least visited entries
  keys.sort((a, b) => memory[a].visits - memory[b].visits);
  const toRemove = keys.length - MAX_MEMORY_ENTRIES;
  for (let i = 0; i < toRemove; i++) {
    delete memory[keys[i]];
  }
}

function getMemoryEntry(board) {
  return memory[boardToKey(board)] || null;
}

function updateMemory(board, aiSymbol, result) {
  const key = boardToKey(board);
  if (!memory[key]) {
    memory[key] = { wins: 0, visits: 0, lastSeen: Date.now() };
  }

  const entry = memory[key];
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
setInterval(() => {
  saveMemory();
}, MEMORY_SAVE_INTERVAL_MS);

// Save on process exit
process.on('exit', saveMemory);
process.on('SIGINT', () => { saveMemory(); process.exit(); });
process.on('SIGTERM', () => { saveMemory(); process.exit(); });

// --- MCTS Node ---

class MCTSNode {
  constructor(board, symbol, parent, move, cols, rows) {
    this.board = board.slice();
    this.symbol = symbol;
    this.parent = parent;
    this.move = move;
    this.cols = cols;
    this.rows = rows;
    this.children = [];
    this.untriedMoves = this._getAvailableMoves();

    // Initialize from memory if available
    const memEntry = getMemoryEntry(this.board);
    if (memEntry && memEntry.visits > 0) {
      this.wins = Math.round(memEntry.wins * LEARNING_RATE);
      this.visits = Math.round(memEntry.visits * LEARNING_RATE);
    } else {
      this.wins = 0;
      this.visits = 0;
    }
  }

  _getAvailableMoves() {
    const moves = [];
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === '') { moves.push(i); }
    }
    return moves;
  }

  _nextSymbol() {
    return this.symbol === 'O' ? 'X' : 'O';
  }

  isFullyExpanded() {
    return this.untriedMoves.length === 0;
  }

  isTerminal() {
    return this._checkWinner('O') || this._checkWinner('X') ||
      this._getAvailableMoves().length === 0;
  }

  _generateWinSequences() {
    const cols = this.cols;
    const rows = this.rows;
    const sequences = [];

    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) { row.push(r * cols + c); }
      sequences.push(row);
    }
    for (let c2 = 0; c2 < cols; c2++) {
      const col = [];
      for (let r2 = 0; r2 < rows; r2++) { col.push(r2 * cols + c2); }
      sequences.push(col);
    }
    if (cols === rows) {
      const d1 = [], d2 = [];
      for (let d = 0; d < cols; d++) {
        d1.push(d * cols + d);
        d2.push(d * cols + (cols - 1 - d));
      }
      sequences.push(d1);
      sequences.push(d2);
    }
    return sequences;
  }

  _checkWinner(symbol) {
    const board = this.board;
    const sequences = this._generateWinSequences();
    return sequences.some((seq) => seq.every((idx) => board[idx] === symbol));
  }

  bestChild(explorationWeight) {
    let best = null;
    let bestScore = -Infinity;

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      if (child.visits === 0) {
        // Unvisited children get maximum exploration score
        return child;
      }
      const exploitation = child.wins / child.visits;
      const exploration = Math.sqrt(Math.log(this.visits) / child.visits);
      const score = exploitation + explorationWeight * exploration;

      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }
    return best;
  }

  expand() {
    const moveIdx = Math.floor(Math.random() * this.untriedMoves.length);
    const move = this.untriedMoves.splice(moveIdx, 1)[0];
    const nextSymbol = this._nextSymbol();
    const newBoard = this.board.slice();
    newBoard[move] = nextSymbol;

    const child = new MCTSNode(newBoard, nextSymbol, this, move, this.cols, this.rows);
    this.children.push(child);
    return child;
  }

  simulate() {
    const simBoard = this.board.slice();
    let currentSymbol = this._nextSymbol();

    const available = [];
    for (let i = 0; i < simBoard.length; i++) {
      if (simBoard[i] === '') { available.push(i); }
    }

    const sequences = this._generateWinSequences();
    const hasWon = (sym) => sequences.some((seq) => seq.every((idx) => simBoard[idx] === sym));

    while (available.length > 0) {
      const randIdx = Math.floor(Math.random() * available.length);
      const move = available.splice(randIdx, 1)[0];
      simBoard[move] = currentSymbol;

      if (hasWon(currentSymbol)) {
        return currentSymbol;
      }

      currentSymbol = currentSymbol === 'O' ? 'X' : 'O';
    }

    return 'draw';
  }

  backpropagate(winner, aiSymbol) {
    let node = this;
    while (node !== null) {
      node.visits++;
      if (winner === aiSymbol) {
        node.wins++;
      } else if (winner !== 'draw') {
        node.wins--;
      }
      node = node.parent;
    }
  }
}

// --- Public API ---

function getIterations(difficulty) {
  const range = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

function findBestMove(board, aiSymbol, cols, rows, difficulty) {
  const iterations = getIterations(difficulty);

  const opponentSymbol = aiSymbol === 'O' ? 'X' : 'O';
  const root = new MCTSNode(board, opponentSymbol, null, null, cols, rows);

  for (let i = 0; i < iterations; i++) {
    let node = root;

    // Selection
    while (node.isFullyExpanded() && node.children.length > 0) {
      node = node.bestChild(EXPLORATION_WEIGHT);
    }

    // Expansion
    if (!node.isTerminal() && !node.isFullyExpanded()) {
      node = node.expand();
    }

    // Simulation
    let result;
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
  let bestMove = -1;
  let mostVisits = -1;
  for (let j = 0; j < root.children.length; j++) {
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
  for (let i = 0; i < positionHistory.length; i++) {
    updateMemory(positionHistory[i], aiSymbol, result);
  }
  pruneMemory();
}

/**
 * Get memory statistics for monitoring.
 */
function getStats() {
  const keys = Object.keys(memory);
  let totalVisits = 0;
  for (let i = 0; i < keys.length; i++) {
    totalVisits += memory[keys[i]].visits;
  }
  return {
    positions: keys.length,
    totalVisits,
  };
}

module.exports = {
  findBestMove,
  recordGame,
  getStats,
};
