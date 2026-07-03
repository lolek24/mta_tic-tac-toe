/*global QUnit*/

sap.ui.define([
	"com/tic-tac-toe/controller/lobby.controller"
], function (LobbyController) {
	"use strict";

	QUnit.module("lobby Controller — WebSocket listener lifecycle");

	// Build a controller with just enough of the view/component stubbed for onInit.
	function makeController() {
		const oController = new LobbyController();
		oController.getView = function () {
			return {
				setModel: function () {},
				byId: function () { return { setEnabled: function () {} }; },
				getModel: function () {
					return { setProperty: function () {}, getProperty: function () { return ""; } };
				}
			};
		};
		oController.getOwnerComponent = function () {
			return {
				getRouter: function () {
					return {
						getRoute: function () { return { attachPatternMatched: function () {} }; },
						navTo: function () {}
					};
				}
			};
		};
		return oController;
	}

	function mockWs() {
		return {
			readyState: WebSocket.OPEN,
			added: [], removed: [], sent: [],
			addEventListener: function (t, h) { this.added.push([t, h]); },
			removeEventListener: function (t, h) { this.removed.push([t, h]); },
			send: function (d) { this.sent.push(d); }
		};
	}

	QUnit.test("onInit creates a stable message handler", function (assert) {
		const oController = makeController();
		oController.onInit();
		assert.strictEqual(typeof oController._onWsMessage, "function", "stable _onWsMessage bound");
	});

	QUnit.test("_startGame detaches the lobby listener before navigating", function (assert) {
		const oController = makeController();
		oController.onInit();
		oController.ws = mockWs();

		oController._startGame({ gameId: "g", symbol: "O", opponent: "x", cols: 3, rows: 3 });

		assert.strictEqual(oController.ws.removed.length, 1, "one removeEventListener call");
		assert.strictEqual(oController.ws.removed[0][0], "message", "detached the 'message' listener");
		assert.strictEqual(oController.ws.removed[0][1], oController._onWsMessage, "detached the stable handler");
	});

	QUnit.test("_onLobbyEntered re-attaches the listener and refreshes the list", function (assert) {
		const oController = makeController();
		oController.onInit();
		oController.ws = mockWs();

		oController._onLobbyEntered();

		const bReattached = oController.ws.added.some(function (a) {
			return a[0] === "message" && a[1] === oController._onWsMessage;
		});
		assert.ok(bReattached, "re-attached the message listener on lobby entry");
		assert.ok(oController.ws.sent.some(function (s) { return s.indexOf("refreshList") !== -1; }), "sent refreshList");
	});
});
