# Code Quality Patterns

## Constants over Magic Numbers

Extract all magic numbers to named constants at the top of the file:

```javascript
// Server
var PORT = process.env.PORT || 8082;
var BOARD_COLS = 3;
var BOARD_ROWS = 3;
var AI_MOVE_DELAY_MS = 300;
var GAME_TIMEOUT_MS = 10 * 60 * 1000;

// Client
var WS_PORT = 8082;
var CELL_SIZE_PX = 120;
var RECONNECT_DELAY_MS = 2000;
var MAX_RECONNECT_ATTEMPTS = 5;

// AI
var EXPLORATION_WEIGHT = 1.41;
```

## Naming Conventions

- Private properties: prefix with `_` (e.g., `_board`, `_gameover`, `_ws`)
- Constants: UPPER_SNAKE_CASE
- Functions: camelCase
- CSS classes: lowercase with prefix (e.g., `tttCell`)

## DRY — Don't Repeat Yourself

- Extract `notifyBothPlayers(game, data)` instead of duplicating sendTo calls
- Extract `createEmptyBoard(cols, rows)` instead of inline loops
- Extract `handleMove(playerId, msg)` from the main switch statement

## Error Boundaries

- Wrap all external input processing in try-catch
- Log errors server-side (`console.error`)
- Send user-friendly error messages to client (`{ type: 'error', message: '...' }`)

## Unused Code

- Remove unused imports (e.g., `Icon` imported but only used internally)
- Remove empty event handlers (e.g., `onmouseover`, `onmouseout`)
- Remove commented-out code — use git history instead
- Remove unnecessary `onAfterRendering` that just calls super
