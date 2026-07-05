'use strict';

// Main-thread client for the AI worker. Lazily spawns a single worker and
// exposes promise-based findBestMove / recordGame so the game server never
// blocks the event loop on MCTS.

const { Worker } = require('node:worker_threads');
const path = require('node:path');

let worker = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject }

function rejectAll(err) {
  for (const { reject } of pending.values()) { reject(err); }
  pending.clear();
}

function ensureWorker() {
  if (worker) { return worker; }

  worker = new Worker(path.join(__dirname, 'aiWorker.js'), { env: process.env });

  worker.on('message', (msg) => {
    const entry = pending.get(msg.id);
    if (!entry) { return; }
    pending.delete(msg.id);
    if (msg.error) { entry.reject(new Error(msg.error)); }
    else { entry.resolve(msg); }
  });
  worker.on('error', (err) => { rejectAll(err); worker = null; });
  worker.on('exit', () => { rejectAll(new Error('AI worker exited')); worker = null; });

  // Never keep the process alive on the worker's account.
  worker.unref();
  return worker;
}

function send(payload) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ ...payload, id });
  });
}

function findBestMove(board, aiSymbol, cols, rows, difficulty) {
  return send({ type: 'findBestMove', board, aiSymbol, cols, rows, difficulty })
    .then((m) => m.move);
}

function recordGame(positionHistory, aiSymbol, result) {
  return send({ type: 'recordGame', positionHistory, aiSymbol, result })
    .then((m) => m.stats);
}

function getStats() {
  return send({ type: 'stats' }).then((m) => m.stats);
}

function resetMemory() {
  return send({ type: 'reset' }).then((m) => m.stats);
}

// Flush the worker's learned memory to disk, then stop it (graceful shutdown).
function shutdown() {
  if (!worker) { return Promise.resolve(); }
  const w = worker;
  return send({ type: 'save' }).catch(() => {}).then(() => w.terminate());
}

module.exports = { findBestMove, recordGame, getStats, resetMemory, shutdown };
