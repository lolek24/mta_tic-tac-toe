/*global QUnit*/

sap.ui.define([
	"com/tic-tac-toe/controller/main.controller",
	"sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
	"use strict";

	// Stub the i18n helper source (owner component -> i18n model -> bundle).
	function stubI18n(oController) {
		oController.getOwnerComponent = function () {
			return {
				getModel: function () {
					return { getResourceBundle: function () { return { getText: function (sKey) { return sKey; } }; } };
				}
			};
		};
	}

	QUnit.module("main Controller");

	QUnit.test("onInit wires the 'game' route pattern-matched handler", function (assert) {
		const oController = new Controller();

		let bAttached = false;
		let sRoute = "";
		oController.getOwnerComponent = function () {
			return {
				getRouter: function () {
					return {
						getRoute: function (sName) {
							sRoute = sName;
							return { attachPatternMatched: function () { bAttached = true; } };
						}
					};
				}
			};
		};
		oController.getView = function () {
			return { setModel: function () {} };
		};

		oController.onInit();

		assert.strictEqual(sRoute, "game", "onInit resolves the 'game' route");
		assert.ok(bAttached, "onInit attaches a pattern-matched handler");
	});

	QUnit.test("_buildBoard populates the cells model with indexed empty cells", function (assert) {
		const oController = new Controller();
		const oGameModel = new JSONModel({ cells: [] });
		const oBoard = { setGridTemplateColumns: function () {}, setGridTemplateRows: function () {} };
		oController.getView = function () {
			return { getModel: function () { return oGameModel; }, byId: function () { return oBoard; } };
		};
		stubI18n(oController);

		oController._buildBoard(3, 3);

		const aCells = oGameModel.getProperty("/cells");
		assert.strictEqual(aCells.length, 9, "9 cells for a 3x3 board");
		assert.strictEqual(aCells[0].index, 0, "first cell index");
		assert.strictEqual(aCells[8].index, 8, "last cell index");
		assert.strictEqual(aCells[4].symbol, "", "cells start empty");
	});

	QUnit.test("onCellPress sends a move only for an empty cell on the player's turn", function (assert) {
		const oController = new Controller();
		const oGameModel = new JSONModel({
			myTurn: true,
			cells: [{ index: 0, symbol: "" }, { index: 1, symbol: "X" }]
		});
		const aSent = [];
		oController._ws = { readyState: WebSocket.OPEN, send: function (s) { aSent.push(JSON.parse(s)); } };
		oController._gameId = "g1";
		oController._gameover = false;
		oController.getView = function () { return { getModel: function () { return oGameModel; } }; };
		stubI18n(oController);

		const eventForCell = (iIndex) => ({
			getSource: function () {
				return { getBindingContext: function () { return { getProperty: function () { return iIndex; } }; } };
			}
		});

		oController.onCellPress(eventForCell(0));
		assert.strictEqual(aSent.length, 1, "move sent for the empty cell");
		assert.strictEqual(aSent[0].index, 0);
		assert.strictEqual(aSent[0].gameId, "g1");

		aSent.length = 0;
		oController.onCellPress(eventForCell(1));
		assert.strictEqual(aSent.length, 0, "no move for an occupied cell");

		aSent.length = 0;
		oGameModel.setProperty("/myTurn", false);
		oController.onCellPress(eventForCell(0));
		assert.strictEqual(aSent.length, 0, "no move when it is not the player's turn");
	});

});
