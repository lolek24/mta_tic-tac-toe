# Security Checklist for Web Game Applications

## Input Validation

- [ ] Sanitize player names (trim, max length, strip dangerous chars)
- [ ] Validate enum values (difficulty must be one of known values)
- [ ] Check numeric ranges (move index must be integer, within board bounds)
- [ ] Verify game ownership (player must belong to the game they're acting on)
- [ ] Validate turn order (server checks `currentTurn === playerId`)
- [ ] Reject actions from unregistered players (require `join` first)
- [ ] Type-check all message fields (`typeof msg.index === 'number'`)

## Content Security Policy

- [ ] Set `default-src 'self'`
- [ ] Allow CDN in `script-src`, `style-src`, `font-src`, `img-src`
- [ ] Use generic `ws: wss:` in `connect-src` instead of hardcoded URLs
- [ ] Note: SAPUI5 requires `'unsafe-eval'` — this is a framework limitation
- [ ] Set `frame-options: deny` to prevent clickjacking

## WebSocket Security

- [ ] Parse JSON in try-catch (malformed messages shouldn't crash server)
- [ ] Wrap message handlers in try-catch (one error shouldn't affect other players)
- [ ] Rate limit connections per IP (not implemented — future improvement)
- [ ] Consider WSS (WebSocket Secure) for production
- [ ] Clean up player state on disconnect (games, player registry)

## Server-Side Authority

- [ ] Game state is server-authoritative (clients can't forge moves)
- [ ] Win/draw detection runs on server (clients display results only)
- [ ] Turn enforcement on server (clients show "not your turn" but server blocks regardless)

## Environment Configuration

- [ ] Port configurable via `process.env.PORT`
- [ ] No secrets in client-side code
- [ ] No hardcoded URLs in CSP or JavaScript (use relative/dynamic values)
