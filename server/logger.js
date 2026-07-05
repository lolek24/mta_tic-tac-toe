'use strict';

// Minimal leveled logger: timestamped, level-filtered (LOG_LEVEL env), with an
// optional structured meta field. Replaces scattered console.* calls.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function emit(level, msg, meta) {
  if (LEVELS[level] > threshold) { return; }
  let line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (meta !== undefined) {
    line += ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  }
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

module.exports = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
