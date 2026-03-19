# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SAP Multi-Target Application (MTA) implementing a Tic Tac Toe game using SAPUI5. Deployed to SAP Cloud Platform via HTML5 Application Repository.

## Build & Test Commands

All commands run from the `tic-tac-toe/` directory:

- **Build**: `grunt` (runs clean, lint, build)
- **Lint**: `grunt lint`
- **Tests**: `grunt unit_and_integration_tests` (or `npm test`)
- **MTA Build** (from root): `mbt build` (requires SAP MTA Build Tool)

## Architecture

### MTA Structure (`mta.yaml`)

Three modules deployed together:

- **`mta_tic-tac-toe_appRouter`** — Node.js approuter handling authentication (XSUAA) and routing to the HTML5 repo
- **`mta_tic-tac-toe_ui_deployer`** — Deploys built UI artifacts to the HTML5 Application Repository
- **`tic-tac-toe`** — The SAPUI5 application (built with Grunt, output in `dist/`)

### SAPUI5 App (`tic-tac-toe/`)

- **Namespace**: `com.tic-tac-toe`
- **Root view**: `webapp/view/main.view.xml` (XML view) with controller `webapp/controller/main.controller.js`
- **Component**: `webapp/Component.js` — standard UIComponent with manifest-driven config
- **Models**: JSONModel for board state (`board`), i18n ResourceModel
- **Custom control**: `com.tic-tac-toe.custom.ui.containers.customControl` used for board cells
- **CSS Grid layout**: Board rendered using `sap.ui.layout.cssgrid.CSSGrid` with configurable dimensions via sliders (3-10)
- **ESLint**: extends `ui5` config (`.eslintrc`)
- **Min UI5 Version**: 1.65.6

### Game Logic

Game state lives in `main.controller.js`: board config (default 3x3), symbols (O/X with turn tracking), winning sequences (hardcoded for 3x3), and game-over flag. Board cells are dynamically created `customControl` instances added to the CSSGrid.
