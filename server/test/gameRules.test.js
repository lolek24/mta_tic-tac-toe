'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const rules = require('../gameRules');

const E = ''; // empty cell
const seqOf = (s) => JSON.stringify(s);

test('generateWinningSequences: 3x3 yields 3 rows + 3 cols + 2 diagonals', () => {
  const seq = rules.generateWinningSequences(3, 3);
  assert.strictEqual(seq.length, 8);
  assert.deepStrictEqual(seq[0], [0, 1, 2], 'first row');
  assert.deepStrictEqual(seq[3], [0, 3, 6], 'first column');
  assert.ok(seq.some((s) => seqOf(s) === seqOf([0, 4, 8])), 'main diagonal');
  assert.ok(seq.some((s) => seqOf(s) === seqOf([2, 4, 6])), 'anti-diagonal');
});

test('generateWinningSequences: non-square boards have no diagonals', () => {
  const seq = rules.generateWinningSequences(3, 2); // 3 cols, 2 rows
  assert.strictEqual(seq.length, 5, '2 rows + 3 cols, no diagonals');
});

test('checkWin detects row, column and diagonal wins', () => {
  const seq = rules.generateWinningSequences(3, 3);
  assert.ok(rules.checkWin(['O', 'O', 'O', E, E, E, E, E, E], 'O', seq), 'row');
  assert.ok(rules.checkWin(['X', E, E, 'X', E, E, 'X', E, E], 'X', seq), 'column');
  assert.ok(rules.checkWin(['O', E, E, E, 'O', E, E, E, 'O'], 'O', seq), 'diagonal');
});

test('checkWin returns false when there is no complete line', () => {
  const seq = rules.generateWinningSequences(3, 3);
  const board = ['O', 'X', 'O', E, E, E, E, E, E];
  assert.strictEqual(rules.checkWin(board, 'O', seq), false);
  assert.strictEqual(rules.checkWin(board, 'X', seq), false);
});

test('checkDraw is true only when the board is full', () => {
  assert.strictEqual(rules.checkDraw(['O', 'X', 'O', 'X', 'O', 'X', 'X', 'O', 'X']), true);
  assert.strictEqual(rules.checkDraw(['O', 'X', 'O', 'X', 'O', 'X', 'X', 'O', E]), false);
});

test('getAvailableMoves returns the empty-cell indices', () => {
  assert.deepStrictEqual(rules.getAvailableMoves(['O', E, 'X', E]), [1, 3]);
  assert.deepStrictEqual(rules.getAvailableMoves(['O', 'X']), []);
});
