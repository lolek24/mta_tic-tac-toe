# WebSocket Patterns for Real-Time Games

## Server Architecture

### State Management
- Keep authoritative game state on the server (board, turns, win detection)
- Client maintains visual copy only — never trust client-side validation for game logic
- Use `crypto.randomUUID()` for unique player/game IDs

### Message Protocol
- JSON messages with `type` field for routing
- Server validates every message: check player exists, is in correct state, owns the game
- Always verify `currentTurn === playerId` before accepting moves
- Sanitize all inputs: trim names, validate difficulty enums, check index bounds

### Error Handling
- Wrap message handlers in try-catch — one bad message shouldn't crash the server
- Require `join` before any other action — reject messages from unregistered players
- Send `error` type back to client with human-readable messages

## Client Architecture

### Message Dispatcher Pattern
- Use a single `_dispatch(event)` method bound once with `bind(this)`
- Store bound reference: `this._boundDispatch = this._dispatch.bind(this)`
- Assign once: `ws.onmessage = this._boundDispatch`
- Avoid reassigning `ws.onmessage` when switching views — use the dispatcher to route by `msg.type`

### Reconnection
- Implement exponential backoff: `delay = BASE_DELAY * attemptNumber`
- Set max attempts (e.g., 5) before giving up
- Clear reconnect timer on `onExit`
- Check `ws.readyState === WebSocket.OPEN` before sending

### Connection State
- Always check WebSocket state before `send()` — show "Connection lost" if closed
- Use a single `_setupWebSocket(name, onReady)` method for both Connect and Play vs Computer flows
- Pass callback for post-connection actions (e.g., sending `playAI` after `joined`)

## Game Lifecycle

### Timeouts
- Set inactivity timeout per game (e.g., 10 minutes)
- Reset timeout on every move
- Clear timeout on game end (`endGame`)
- Notify players with `gameOver { result: 'timeout' }` before cleanup

### Cleanup
- On WebSocket `close`: iterate games, notify opponents, end games, remove player
- On `leaveGame`: verify player belongs to the game before processing
- Always call `broadcastPlayerList()` after state changes
