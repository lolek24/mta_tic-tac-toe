'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Isolate the transposition table to a throwaway file BEFORE loading the module.
const MEM = path.join(os.tmpdir(), `ttt-ai-mem-${process.pid}.json`);
process.env.AI_MEMORY_FILE = MEM;

const AI = require('../MonteCarloAI');

before(() => { try { fs.unlinkSync(MEM); } catch (e) { /* ignore */ } });
after(() => { try { fs.unlinkSync(MEM); } catch (e) { /* ignore */ } });

const E = ''; // empty cell

test('findBestMove returns the only legal move when the board is nearly full', () => {
  // Cell 8 is the single empty square -> it is the forced (deterministic) move.
  const board = ['O', 'X', 'O', 'X', 'O', 'X', 'X', 'O', E];
  assert.strictEqual(AI.findBestMove(board, 'O', 3, 3, 'easy'), 8);
});

test('findBestMove returns -1 on a full board', () => {
  const board = ['O', 'X', 'O', 'X', 'O', 'X', 'X', 'O', 'X'];
  assert.strictEqual(AI.findBestMove(board, 'O', 3, 3, 'easy'), -1);
});

test('findBestMove returns a valid empty-cell index on an empty board', () => {
  const board = [E, E, E, E, E, E, E, E, E];
  const move = AI.findBestMove(board, 'O', 3, 3, 'easy');
  assert.ok(move >= 0 && move <= 8, 'move within range');
  assert.strictEqual(board[move], E, 'move targets an empty cell');
});

test('findBestMove takes an immediate winning move when one exists', () => {
  // O has 0 and 1; playing 2 completes the top row. The only other move (5) does not.
  const board = ['O', 'O', E, 'X', 'X', E, E, E, E];
  assert.strictEqual(AI.findBestMove(board, 'O', 3, 3, 'hard'), 2);
});

test('recordGame updates the position memory (getStats reflects it)', () => {
  const before = AI.getStats();
  const history = [
    [E, E, E, E, E, E, E, E, E],
    ['O', E, E, E, E, E, E, E, E],
    ['O', E, E, E, 'X', E, E, E, E],
  ];
  AI.recordGame(history, 'X', 'X'); // AI (X) won
  const after = AI.getStats();
  assert.ok(after.positions >= before.positions + 1, 'positions grew');
  assert.ok(after.totalVisits >= before.totalVisits + history.length, 'visits grew');
});
