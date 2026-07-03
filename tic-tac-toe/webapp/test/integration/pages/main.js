sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";
	// The app opens on the lobby route (empty pattern), so the initial page is
	// the lobby view — not "main", which is only shown on the /game route.
	const sViewName = "lobby";
	Opa5.createPageObjects({
		onTheAppPage: {

			actions: {},

			assertions: {

				iShouldSeeTheApp: function () {
					return this.waitFor({
						id: "lobbyPage",
						viewName: sViewName,
						success: function () {
							Opa5.assert.ok(true, "The lobby view is displayed");
						},
						errorMessage: "Did not find the lobby view"
					});
				}
			}
		}
	});

});