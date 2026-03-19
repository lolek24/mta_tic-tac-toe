sap.ui.define([], function() {
  'use strict';

  // Monte Carlo Tree Search node
  function MCTSNode(board, symbol, parent, move, cols, rows) {
    this.board = board.slice();
    this.symbol = symbol; // symbol of the player who JUST moved
    this.parent = parent;
    this.move = move;
    this.cols = cols;
    this.rows = rows;
    this.children = [];
    this.wins = 0;
    this.visits = 0;
    this.untriedMoves = this._getAvailableMoves();
  }

  MCTSNode.prototype._getAvailableMoves = function() {
    var moves = [];
    for (var i = 0; i < this.board.length; i++) {
      if (this.board[i] === '') {
        moves.push(i);
      }
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

  // UCB1 formula for child selection
  MCTSNode.prototype.bestChild = function(explorationWeight) {
    var best = null;
    var bestScore = -Infinity;

    for (var i = 0; i < this.children.length; i++) {
      var child = this.children[i];
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

  // Expand: pick an untried move, create a child node
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

  // Simulate: random playout from current state
  MCTSNode.prototype.simulate = function() {
    var simBoard = this.board.slice();
    var currentSymbol = this._nextSymbol();
    var cols = this.cols;
    var rows = this.rows;

    var available = [];
    for (var i = 0; i < simBoard.length; i++) {
      if (simBoard[i] === '') { available.push(i); }
    }

    // Helper to check winner on simBoard
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

  // Backpropagate result up the tree
  MCTSNode.prototype.backpropagate = function(winner, aiSymbol) {
    var node = this;
    while (node !== null) {
      node.visits++;
      if (winner === aiSymbol) {
        node.wins++;
      } else if (winner !== 'draw') {
        // opponent won
        node.wins--;
      }
      node = node.parent;
    }
  };

  // Main AI object
  var MonteCarloAI = {
    // Difficulty: number of MCTS iterations
    DIFFICULTY: {
      easy: 100,
      medium: 500,
      hard: 2000,
    },

    /**
     * Find the best move using Monte Carlo Tree Search.
     * @param {Array} board - current board state
     * @param {string} aiSymbol - 'O' or 'X'
     * @param {number} cols - board columns
     * @param {number} rows - board rows
     * @param {string} difficulty - 'easy', 'medium', or 'hard'
     * @returns {number} best move index
     */
    findBestMove: function(board, aiSymbol, cols, rows, difficulty) {
      var iterations = this.DIFFICULTY[difficulty] || this.DIFFICULTY.medium;

      // The last symbol played is the opponent's (since it's now AI's turn)
      var opponentSymbol = aiSymbol === 'O' ? 'X' : 'O';
      var root = new MCTSNode(board, opponentSymbol, null, null, cols, rows);

      for (var i = 0; i < iterations; i++) {
        var node = root;

        // 1. Selection — traverse tree using UCB1
        while (node.isFullyExpanded() && node.children.length > 0) {
          node = node.bestChild(1.41);
        }

        // 2. Expansion
        if (!node.isTerminal() && !node.isFullyExpanded()) {
          node = node.expand();
        }

        // 3. Simulation
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

        // 4. Backpropagation
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
    },
  };

  return MonteCarloAI;
});
