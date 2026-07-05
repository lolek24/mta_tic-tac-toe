'use strict';

/**
 * Shared, side-effect-free Tic-Tac-Toe rules used by both the authoritative
 * server (server.js) and the AI (MonteCarloAI.js) so the two can never drift.
 *
 * Boards are flat arrays of length cols*rows; '' means an empty cell.
 */

// All winning lines for a cols×rows board: every row, every column, and (only
// for square boards) the two diagonals. Indices are into the flat board array.
function generateWinningSequences(cols, rows) {
  const sequences = [];

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) { row.push(r * cols + c); }
    sequences.push(row);
  }
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < rows; r++) { col.push(r * cols + c); }
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

// True if `symbol` fully occupies any of the given winning sequences.
function checkWin(board, symbol, sequences) {
  return sequences.some((seq) => seq.every((idx) => board[idx] === symbol));
}

// True if the board has no empty cell left.
function checkDraw(board) {
  return board.every((cell) => cell !== '');
}

// Indices of all empty cells.
function getAvailableMoves(board) {
  const moves = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === '') { moves.push(i); }
  }
  return moves;
}

module.exports = {
  generateWinningSequences,
  checkWin,
  checkDraw,
  getAvailableMoves,
};
