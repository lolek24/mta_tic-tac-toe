/*global QUnit*/

sap.ui.define([
	"com/tic-tac-toe/controller/main.controller"
], function (Controller) {
	"use strict";

	QUnit.module("main Controller");

	QUnit.test("onInit wires the 'game' route pattern-matched handler", function (assert) {
		const oController = new Controller();

		// onInit depends on the owner component + view, so provide minimal stubs.
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

});
