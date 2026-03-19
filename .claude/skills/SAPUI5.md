# SAPUI5 Development Patterns

## XML Views

- Root element MUST be `<mvc:View>` (namespace `sap.ui.core.mvc`), NOT `<View>` with default `sap.m` namespace
- Expression binding escaping: avoid apostrophes in expression bindings inside XML attributes — use alternative text instead
- Custom controls added programmatically (not via XML) don't get controller method names resolved as strings — pass bound functions instead

## Custom Controls

- Properties set in constructor are applied AFTER `init()` — don't read them in `init()`
- Renderer uses old API (`oRm.write`, `oRm.writeControlData`, `oRm.addClass`) for UI5 < 1.67
- Add custom CSS classes via `oRm.addClass()` in renderer, not by targeting framework classes like `sapUiLayoutCSSGridItem`
- `invalidate()` triggers re-rendering — call after changing visual state

## CSSGrid Layout

- `sap.ui.layout.cssgrid.CSSGrid` wraps items in `<div class="sapUiLayoutCSSGridItem">` — style the inner control, not the wrapper
- `mix-blend-mode: screen` makes elements invisible on white backgrounds
- Pseudo-elements with `float` break flexbox layout — use `aspect-ratio` instead
- Grid items need explicit dimensions (`width`, `height`) or they may collapse

## Routing

- Define routes in `manifest.json` under `sap.ui5.routing`
- Root view provides the `App` container (`controlId`)
- `attachPatternMatched` for route enter logic, fires on every navigation to the route
- Pass data between views via `Component` properties (e.g., `oComponent._gameData`)

## Content Security Policy

- SAPUI5 requires `'unsafe-eval'` in `script-src` (mandatory for framework)
- Use `ws: wss:` in `connect-src` instead of hardcoding WebSocket URLs
- `connect-src` defaults to `default-src` if not set — explicitly set it when using CDN + WebSocket
