'use strict';

// Worker thread: owns the AI transposition table and runs the (CPU-heavy) MCTS
// off the main event loop. It is the single owner of the learning memory, so
// findBestMove (reads memory) and recordGame (writes memory) stay consistent.

const { parentPort } = require('node:worker_threads');
const MonteCarloAI = require('./MonteCarloAI');

parentPort.on('message', (msg) => {
  try {
    switch (msg.type) {
      case 'findBestMove': {
        const move = MonteCarloAI.findBestMove(
          msg.board, msg.aiSymbol, msg.cols, msg.rows, msg.difficulty
        );
        parentPort.postMessage({ id: msg.id, move });
        break;
      }
      case 'recordGame':
        MonteCarloAI.recordGame(msg.positionHistory, msg.aiSymbol, msg.result);
        parentPort.postMessage({ id: msg.id, stats: MonteCarloAI.getStats() });
        break;
      case 'save':
        MonteCarloAI.save();
        parentPort.postMessage({ id: msg.id, saved: true });
        break;
      case 'stats':
        parentPort.postMessage({ id: msg.id, stats: MonteCarloAI.getStats() });
        break;
      case 'reset':
        MonteCarloAI.reset();
        parentPort.postMessage({ id: msg.id, stats: MonteCarloAI.getStats() });
        break;
      default:
        parentPort.postMessage({ id: msg.id, error: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    parentPort.postMessage({ id: msg.id, error: err.message });
  }
});
