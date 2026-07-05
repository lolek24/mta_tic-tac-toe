'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const WebSocket = require('ws');

// Isolate AI memory before requiring the server (which loads MonteCarloAI).
const MEM = path.join(os.tmpdir(), `ttt-ai-mem-srv-${process.pid}.json`);
process.env.AI_MEMORY_FILE = MEM;

const { server, wss } = require('../server');
const ai = require('../aiClient');

let PORT;

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  PORT = server.address().port;
});

after(async () => {
  wss.close();
  await new Promise((resolve) => server.close(resolve));
  await ai.shutdown();
  try { fs.unlinkSync(MEM); } catch (e) { /* ignore */ }
});

// --- helpers ---

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  ws.inbox = [];
  ws.on('message', (d) => ws.inbox.push(JSON.parse(d)));
  return ws;
}

const open = (ws) => new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
const send = (ws, obj) => ws.send(JSON.stringify(obj));
const last = (ws, type) => [...ws.inbox].reverse().find((m) => m.type === type);
const all = (ws, type) => ws.inbox.filter((m) => m.type === type);

async function joinClient(name) {
  const ws = connect();
  await open(ws);
  send(ws, { type: 'join', name });
  await delay(80);
  return ws;
}

async function startPvpGame(nameA, nameB) {
  const a = await joinClient(nameA);
  const b = await joinClient(nameB);
  await delay(40);
  const aId = last(a, 'joined').id;
  const bId = last(b, 'joined').id;
  send(a, { type: 'invite', targetId: bId });
  await delay(60);
  send(b, { type: 'acceptInvite', fromId: aId });
  await delay(80);
  return { a, b, aId, bId, gameId: last(a, 'gameStart').gameId };
}

// --- tests ---

test('join returns a joined ack and broadcasts a player list', async () => {
  const a = await joinClient('Alice');
  assert.strictEqual(last(a, 'joined').name, 'Alice');
  assert.ok(last(a, 'playerList'), 'received a player list');
  a.close();
  await delay(50);
});

test('a second join on the same connection is ignored', async () => {
  const a = await joinClient('Alice');
  send(a, { type: 'join', name: 'Mallory' });
  await delay(60);
  assert.strictEqual(all(a, 'joined').length, 1, 'only one joined ack');
  a.close();
  await delay(50);
});

test('invite -> accept starts a game for both players with O/X symbols', async () => {
  const { a, b } = await startPvpGame('A', 'B');
  assert.strictEqual(last(a, 'gameStart').symbol, 'O');
  assert.strictEqual(last(b, 'gameStart').symbol, 'X');
  a.close(); b.close();
  await delay(50);
});

test('acceptInvite without a real pending invite does not start a game', async () => {
  const a = await joinClient('A');
  const b = await joinClient('B');
  await delay(40);
  const aId = last(a, 'joined').id;
  send(b, { type: 'acceptInvite', fromId: aId });
  await delay(80);
  assert.strictEqual(last(b, 'gameStart'), undefined, 'no forced game');
  a.close(); b.close();
  await delay(50);
});

test('moves enforce turn order and occupied cells, and a row wins', async () => {
  const { a, b, gameId } = await startPvpGame('A', 'B');

  // Out of turn: B (X) cannot move first.
  send(b, { type: 'move', gameId, index: 6 });
  await delay(40);
  assert.strictEqual(all(b, 'moveMade').length, 0, 'out-of-turn move rejected');

  send(a, { type: 'move', gameId, index: 0 });
  await delay(40);
  send(b, { type: 'move', gameId, index: 3 });
  await delay(40);
  // Occupied cell: A cannot replay index 0.
  const beforeOccupied = all(a, 'moveMade').length;
  send(a, { type: 'move', gameId, index: 0 });
  await delay(40);
  assert.strictEqual(all(a, 'moveMade').length, beforeOccupied, 'occupied-cell move rejected');

  send(a, { type: 'move', gameId, index: 1 });
  await delay(40);
  send(b, { type: 'move', gameId, index: 4 });
  await delay(40);
  send(a, { type: 'move', gameId, index: 2 });
  await delay(80);

  const go = last(a, 'gameOver');
  assert.ok(go && go.result === 'win' && go.symbol === 'O' && go.winner === 'A', 'O wins the top row');
  assert.ok(last(b, 'moveMade'), 'moves were broadcast to the opponent');
  a.close(); b.close();
  await delay(50);
});

test('a full board with no line is detected as a draw', async () => {
  const { a, b, gameId } = await startPvpGame('A', 'B');
  // O(A): 0,2,3,7,8  X(B): 1,4,5,6  -> full board, no three-in-a-row.
  const moves = [[a, 0], [b, 1], [a, 2], [b, 4], [a, 3], [b, 5], [a, 7], [b, 6], [a, 8]];
  for (const [who, index] of moves) {
    send(who, { type: 'move', gameId, index });
    await delay(40);
  }
  assert.strictEqual(last(a, 'gameOver').result, 'draw', 'draw detected');
  a.close(); b.close();
  await delay(50);
});

test('leaving a game notifies the opponent', async () => {
  const { a, b, gameId } = await startPvpGame('A', 'B');
  send(a, { type: 'leaveGame', gameId });
  await delay(60);
  assert.ok(last(b, 'opponentLeft'), 'opponent was notified');
  a.close(); b.close();
  await delay(50);
});

test('vs AI: after the player moves the AI replies with its symbol', async () => {
  const c = await joinClient('Carol');
  send(c, { type: 'playAI', difficulty: 'easy' });
  await delay(60);
  const gs = last(c, 'gameStart');
  assert.ok(gs && gs.opponent.startsWith('Computer'), 'AI game started');

  send(c, { type: 'move', gameId: gs.gameId, index: 4 });
  // Extra headroom: the first AI move also spins up the worker thread.
  await delay(1500);
  const moves = all(c, 'moveMade');
  assert.ok(moves.length >= 2 && moves.some((m) => m.symbol === 'X'), 'AI responded as X');
  c.close();
  await delay(50);
});
